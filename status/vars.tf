variable "bitbucket_url" {}

variable "credentials_ssm_path" {}

variable "name" {
  default = "buildkite-bitbucket-status"
}

variable "sns_topic_arn" {}
