const {SSM} = require('aws-sdk');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const {URL} = require('url');

const ssm = new SSM();

const act = async sns => {
    const bitbucketCredentialsPromise = (async () => {
        if (!process.env.BITBUCKET_CREDENTIALS_PATH) {
            return null;
        }
        const request = {
            Name: process.env.BITBUCKET_CREDENTIALS_PATH,
            WithDecryption: true,
        };
        return (await ssm.getParameter(request).promise()).Parameter.Value;
    })();
    const bitbucketSecretPromise = (async () => {
        const request = {
            Name: process.env.BITBUCKET_SECRET_PATH,
            WithDecryption: true,
        };
        return (await ssm.getParameter(request).promise()).Parameter.Value;
    })();
    const buildkiteKeyPromise = (async () => {
        const request = {
            Name: process.env.BUILDKITE_KEY_PATH,
            WithDecryption: true,
        };
        return (await ssm.getParameter(request).promise()).Parameter.Value;
    })(); 

    const signature = sns.MessageAttributes.signature.Value;

    const hmac = crypto.createHmac('sha256', await bitbucketSecretPromise);
    hmac.update(sns.Message);
    const expected = `sha256=${hmac.digest('hex')}`;
    if (expected !== signature) {
        console.log(`Expected signature: ${expected}\nActual signature: ${signature}`);
        console.log(expected);
        console.log(sns.Message);
        throw new Error('Invalid signature');
    }

    const {actor, eventKey, repository, changes} = JSON.parse(sns.Message);
    if (eventKey !== sns.MessageAttributes.event.Value) {
        throw new Error(`Event ${sns.MessageAttributes.event.Value} does not match ${eventKey}`);
    }

    for (const {ref, toHash, type} of changes) {
        switch (type) {
            case 'ADD':
            case 'UPDATE':
                let message;
                if (process.env.BITBUCKET_URL && await bitbucketCredentialsPromise) {
                    const url = new URL(`${process.env.BITBUCKET_URL}/rest/api/1.0/projects/${repository.project.key}/repos/${repository.slug}/commits/${toHash}`);
                    console.log(`Fetching commit info from ${url}`)
                    const options = {
                        auth: await bitbucketCredentialsPromise,
                        headers: {
                            Accept: 'application/json',
                        },
                        hostname: url.hostname,
                        method: 'GET',
                        path: url.pathname,
                        port: url.port,
                    };
                    try {
                        const data = await new Promise((success, failure) => {
                            const request = (url.protocol === 'https:' ? https : http).request(options, response => {
                                if (response.statusCode === 200) {
                                    let data = '';
                                    response.setEncoding('utf8');
                                    response.on('data', chunck => data += chunck);
                                    response.on('end', () => success(data));
                                } else {
                                    failure(new Error(`Status code ${response.statusCode}`));
                                }
                            });
                            request.on('error', failure);
                            request.end();
                        });
                        ({message} = JSON.parse(data));
                    } catch (e) {
                        console.log(e);
                    }
                }
                if (!message) {
                    message = `${repository.project.name} ${repository.name}`;
                }

                const url = new URL(`https://api.buildkite.com/v2/organizations/${process.env.BUILDKITE_ORGANIZATION}/pipelines/${process.env.BUILDKITE_PIPELINE}/builds`);
                console.log(`Creating build at ${url}`);
                const params = {
                    author: {
                        email: actor.emailAddress,
                        name: actor.displayName,
                    },
                    branch: ref.displayId,
                    commit: toHash,
                    message,
                    meta_data: {
                        web_url: `${process.env.BITBUCKET_URL}/projects/${repository.project.key}/repos/${repository.slug}/commits?`
                    },
                };
                const data = Buffer.from(JSON.stringify(params));
                console.log(params);
                const options = {
                    headers: {
                        Authorization: `Bearer ${await buildkiteKeyPromise}`,
                        'Content-Length': data.length,
                        'Content-Type': 'application/json',
                    },
                    hostname: url.hostname,
                    method: 'POST',
                    path: `${url.pathname}?until=${encodeURIComponent(ref.id)}`,
                    port: url.port,
                };
                await new Promise((success, failure) => {
                    const request = https.request(options, response => {
                        if (response.statusCode === 201) {
                            response.on('end', success);
                        } else {
                            failure(new Error(`Status code ${response.statusCode}`));
                        }
                    });
                    request.on('error', failure);
                    request.end(data);
                });
        }
        
    }
};

exports.handler = async ({Records: [{Sns: sns}]}, _, callback) => {
    let result;
    try {
        result = await act(sns);
    } catch (e) {
        callback(e);
    }
    callback(null, result);
};
