# Presentation host
variable "region" {
  default = "us-west-2"
}
resource "aws_instance" "slides" {
  ami = "ami-example"
  instance_type = "t3.micro"
  tags = { Name = "presenter" }
}
