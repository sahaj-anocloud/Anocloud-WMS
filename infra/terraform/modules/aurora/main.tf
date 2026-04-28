variable "db_instance_class" {
  type = string
}

variable "db_name" {
  type = string
}

variable "db_username" {
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

resource "aws_db_subnet_group" "aurora" {
  name       = "sumosave-wms-aurora-${var.environment}"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "sumosave-wms-aurora-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_security_group" "aurora" {
  name        = "sumosave-wms-aurora-${var.environment}"
  description = "Security group for Aurora PostgreSQL"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }

  tags = {
    Name        = "sumosave-wms-aurora-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier      = "sumosave-wms-${var.environment}"
  engine                  = "aurora-postgresql"
  engine_version          = "15.4"
  database_name           = var.db_name
  master_username         = var.db_username
  manage_master_user_password = true
  db_subnet_group_name    = aws_db_subnet_group.aurora.name
  vpc_security_group_ids  = [aws_security_group.aurora.id]
  storage_encrypted       = true
  kms_key_id              = var.kms_key_arn
  deletion_protection     = true
  backup_retention_period = 7
  preferred_backup_window = "02:00-03:00"

  tags = {
    Name        = "sumosave-wms-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "sumosave-wms-writer-${var.environment}"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = var.db_instance_class
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version

  tags = {
    Name        = "sumosave-wms-writer-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_rds_cluster_instance" "reader" {
  identifier         = "sumosave-wms-reader-${var.environment}"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = var.db_instance_class
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version

  tags = {
    Name        = "sumosave-wms-reader-${var.environment}"
    Environment = var.environment
  }
}

output "cluster_endpoint" {
  value = aws_rds_cluster.aurora.endpoint
}

output "reader_endpoint" {
  value = aws_rds_cluster.aurora.reader_endpoint
}
