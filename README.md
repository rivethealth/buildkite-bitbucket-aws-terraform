# Buildkite <-> Bitbucket Server

This integration is comprised of two independent parts.

* [Bitbucket -> Buildkite](#bitbucket---buildkite)
* [Buildkite -> Bitbucket](#buildkite---bitbucket)

## Bitbucket -> Buildkite

Trigger Buildkite builds from Bitbucket changes.

Prerequisites:
* SNS topic with messages from the Bitbucket webhook. See [bitbucket-webhook-aws-terraform](https://github.com/rivethealth/bitbucket-webhook-aws-terraform).
* SSM parameter of Buildkite API token with permission to create builds.
* If you want to see the latest commit message in Buildkite, an SSM parameter of Bitbucket user credentials with read access.

```hcl
module "bitbucket-events" {
  source         = "github.com/rivethealth/bitbucket-webhook-aws-terraform"
}

# bitbucket_credentials_ssm_path and bitbucket_url required only if you want latest commit message in Buildkite
module "buildkite-build" {
  bitbucket_credentials_ssm_path = "/bitbucket/buildkite-credentials"
  bitbucket_secret_ssm_path      = "/bitbucket/webhook-secret"
  bitbucket_url                  = "https://bitbucket.rivetutil.com"
  buildkite_key_ssm_path         = "/buildkite/api-key"
  buildkite_org                  = "example-org"
  buildkite_pipeline             = "example-pipeline"
  name                           = "buildkite-bitbucket-main"
  sns_topic_arn                  = "${module.bitbucket-events.sns_topic_arns[0]}"
  source                         = "github.com/rivethealth/buildkite-bitbucket-aws-terraform//build"
}
```

## Buildkite -> Bitbucket

Set Bitbucket build status from Buildkite events. Requires [buildkite-webhook-aws-terraform](https://github.com/rivethealth/buildkite-webhook-aws-terraform) to connect a Buildkite webhook to an SNS topic.

Prerequistes:
* SNS topic with messages from the Buildkite webhook. See [buildkite-webhook-aws-terraform](https://github.com/rivethealth/buildkite-webhook-aws-terraform).
* SSM parameter of Bitbucket user credentials with admin access.

```hcl
module "buildkite-events" {
  source         = "github.com/rivethealth/buildkite-webhook-aws-terraform"
  token_ssm_path = "/buildkite/webhook-token"
}

module "bitbucket-status" {
  bitbucket_url        = "https://bitbucket.example.com"
  credentials_ssm_path = "/bitbucket/buildkite-credentials"
  source               = "github.com/rivethealth/buildkite-bitbucket-aws-terraform//status"
  sns_topic_arn        = "${module.buildkite-events.sns_topic_arns[0]}"
}
```
