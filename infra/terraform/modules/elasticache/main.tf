variable "redis_node_type" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "kms_key_arn" {
  type = string
}

variable "environment" {
  type = string
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "sumosave-wms-redis-${var.environment}"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "sumosave-wms-redis-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_security_group" "redis" {
  name        = "sumosave-wms-redis-${var.environment}"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }

  tags = {
    Name        = "sumosave-wms-redis-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "sumosave-wms-${var.environment}"
  description          = "SumoSave WMS Redis 7 cluster"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_clusters   = 2
  automatic_failover_enabled = true
  multi_az_enabled     = true
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  kms_key_id           = var.kms_key_arn

  tags = {
    Name        = "sumosave-wms-redis-${var.environment}"
    Environment = var.environment
  }
}

output "primary_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "reader_endpoint" {
  value = aws_elasticache_replication_group.redis.reader_endpoint_address
}
