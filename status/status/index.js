const {SSM} = require('aws-sdk');
const http = require('http');
const https = require('https');
const {URL} = require('url');

const ssm = new SSM();

const act = async message => {
    const tokenRequest = {
        Name: process.env.CREDENTIALS_PATH,
        WithDecryption: true,
    };
    const {Parameter: {Value: credentials}} = await ssm.getParameter(tokenRequest).promise();

    const {build, pipeline} = JSON.parse(message);

    const update = async state => {
        console.log(`Marking ${build.branch} ${build.commit} as #${state}`);
        const data = Buffer.from(JSON.stringify({
            description: pipeline.description,
            name: `Buildkite - ${pipeline.name} #${build.number}`,
            key: `buildkite-${pipeline.name}-${build.branch}`,
            state,
            url: build.web_url,

        }));
        const url = new URL(`${process.env.BITBUCKET_URL}/rest/build-status/1.0/commits/${build.commit}`);
        const options = {
            auth: credentials,
            headers: {
                'Content-Length': data.length,
                'Content-Type': 'application/json',
            },
            hostname: url.hostname,
            method: 'POST',
            path: url.pathname,
            port: url.port,
        };
        await new Promise((success, failure) => {
            const request = (url.protocol === 'https:' ? https : http).request(options, response => {
                if (response.statusCode === 204) {
                    response.on('end', success);
                } else {
                    failure(new Error(`Status code ${response.statusCode}`));
                }
            });
            request.on('error', failure);
            request.end(data);
        });
    }

    switch (build.state) {
        case 'failed':
            await update('FAILED');
            return 'failed';
        case 'passed':
            await update('SUCCESSFUL');
            return 'successful';
        default:
            await update('INPROGRESS');
            return 'inprogress';
    }
    return 'N/A';
};

exports.handler = async ({Records: [{Sns: {Message: message}}]}, _, callback) => {
    let result;
    try {
        result = await act(message);
    } catch (e) {
        callback(e);
    }
    callback(null, result);
};
