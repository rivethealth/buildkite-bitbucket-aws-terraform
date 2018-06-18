variable "bitbucket_credentials_ssm_path" {
  default = ""
}

variable "bitbucket_secret_ssm_path" {}

variable "bitbucket_url" {
  default = ""
}

variable "buildkite_key_ssm_path" {}

variable "buildkite_org" {}

variable "buildkite_pipeline" {}

variable "name" {
  default = "buildkite-bitbucket-build"
}

variable "sns_topic_arn" {}
