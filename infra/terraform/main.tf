terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.region
}

module "kms" {
  source      = "./modules/kms"
  environment = var.environment
}

module "eks" {
  source             = "./modules/eks"
  cluster_name       = var.cluster_name
  region             = var.region
  vpc_id             = var.vpc_id
  private_subnet_ids = var.private_subnet_ids
  environment        = var.environment
}

module "aurora" {
  source             = "./modules/aurora"
  db_instance_class  = var.db_instance_class
  db_name            = var.db_name
  db_username        = var.db_username
  vpc_id             = var.vpc_id
  private_subnet_ids = var.private_subnet_ids
  kms_key_arn        = module.kms.rds_key_arn
  environment        = var.environment
}

module "elasticache" {
  source             = "./modules/elasticache"
  redis_node_type    = var.redis_node_type
  vpc_id             = var.vpc_id
  private_subnet_ids = var.private_subnet_ids
  kms_key_arn        = module.kms.elasticache_key_arn
  environment        = var.environment
}

module "sqs" {
  source      = "./modules/sqs"
  kms_key_arn = module.kms.sqs_key_arn
  environment = var.environment
}

module "s3" {
  source      = "./modules/s3"
  kms_key_arn = module.kms.s3_key_arn
  environment = var.environment
}
