terraform {
  backend "remote" {
    organization = "CR460-Azure-CICD"

    workspaces {
      name = "CR460-Azure-CICD"
    }
  }
}
