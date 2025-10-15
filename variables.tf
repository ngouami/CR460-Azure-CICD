variable "prefix" {
  description = "Préfixe pour nommer les ressources"
  type        = string
  default     = "cr460"
}

variable "location" {
  description = "Région Azure où déployer les ressources"
  type        = string
  default     = "Canada Central"
}
