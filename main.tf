data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "archive_file" "lambda" {
  source_dir  = "${path.module}/status"
  output_path = "${path.module}/status.zip"
  type        = "zip"
}

resource "aws_iam_role" "status" {
  name = "${var.name}"
  path = "/buildkite-bitbucker/"

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

resource "aws_iam_role_policy" "status-ssm" {
  name = "ssm"
  role = "${aws_iam_role.status.id}"

  policy = <<EOF
{
  "Statement": [
    {
      "Action": "ssm:GetParameter",
      "Effect": "Allow",
      "Resource": "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.credentials_ssm_path}"
    }
  ],
  "Version": "2012-10-17"
}
EOF
}

resource "aws_iam_role_policy_attachment" "status-lambda" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = "${aws_iam_role.status.id}"
}

resource "aws_lambda_function" "status" {
  description      = "Update Bitbucket build status from Buildkite events"
  filename         = "${path.module}/status.zip"
  function_name    = "${var.name}"
  handler          = "index.handler"
  publish          = true
  role             = "${aws_iam_role.status.arn}"
  runtime          = "nodejs8.10"
  source_code_hash = "${data.archive_file.lambda.output_base64sha256}"
  timeout          = 60

  environment {
    variables {
      BITBUCKET_URL = "${var.bitbucket_url}"
      CREDENTIALS_PATH = "${var.credentials_ssm_path}"
    }
  }
}

resource "aws_lambda_permission" "status-sns" {
    action        = "lambda:InvokeFunction"
    function_name = "${aws_lambda_function.status.function_name}"
    principal     = "sns.amazonaws.com"
    source_arn    = "${var.sns_topic_arn}"
    statement_id = "AllowExecutionFromSNS"
}

resource "aws_sns_topic_subscription" "status" {
  endpoint  = "${aws_lambda_function.status.arn}"
  protocol  = "lambda"
  topic_arn = "${var.sns_topic_arn}"

    filter_policy = <<EOF
{
  "event": ["build.finished", "build.scheduled"]
}
EOF
}
