data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "archive_file" "lambda" {
  source_dir  = "${path.module}/build"
  output_path = "${path.module}/build.zip"
  type        = "zip"
}

resource "aws_iam_role" "build" {
  name = "${var.name}"
  path = "/buildkite-bitbucket/"

  assume_role_policy = <<EOF
{
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Sid": ""
    }
  ],
  "Version": "2012-10-17"
}
EOF
}

resource "aws_iam_role_policy" "build-ssm" {
  name = "ssm"
  role = "${aws_iam_role.build.id}"

  policy = <<EOF
{
  "Statement": [
    {
      "Action": "ssm:GetParameter",
      "Effect": "Allow",
      "Resource": [
        "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.bitbucket_credentials_ssm_path}",
        "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.bitbucket_secret_ssm_path}",
        "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.buildkite_key_ssm_path}"
      ]
    }
  ],
  "Version": "2012-10-17"
}
EOF
}

resource "aws_iam_role_policy_attachment" "build-lambda" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = "${aws_iam_role.build.id}"
}

resource "aws_lambda_function" "build" {
  description      = "Trigger Buildkite build from Bitbucket push event"
  filename         = "${path.module}/build.zip"
  function_name    = "${var.name}"
  handler          = "index.handler"
  publish          = true
  role             = "${aws_iam_role.build.arn}"
  runtime          = "nodejs8.10"
  source_code_hash = "${data.archive_file.lambda.output_base64sha256}"
  timeout          = 60

  environment {
    variables = {
      BITBUCKET_CREDENTIALS_PATH = "${var.bitbucket_credentials_ssm_path}"
      BITBUCKET_SECRET_PATH      = "${var.bitbucket_secret_ssm_path}"
      BITBUCKET_URL              = "${var.bitbucket_url}"
      BUILDKITE_ORGANIZATION     = "${var.buildkite_org}"
      BUILDKITE_PIPELINE         = "${var.buildkite_pipeline}"
      BUILDKITE_KEY_PATH         = "${var.buildkite_key_ssm_path}"
    }
  }
}

resource "aws_lambda_permission" "build-sns" {
  action        = "lambda:InvokeFunction"
  function_name = "${aws_lambda_function.build.function_name}"
  principal     = "sns.amazonaws.com"
  source_arn    = "${var.sns_topic_arn}"
  statement_id  = "AllowExecutionFromSNS"
}

resource "aws_sns_topic_subscription" "build" {
  endpoint  = "${aws_lambda_function.build.arn}"
  protocol  = "lambda"
  topic_arn = "${var.sns_topic_arn}"

  filter_policy = <<EOF
{
  "event": ["repo:refs_changed"]
}
EOF
}
