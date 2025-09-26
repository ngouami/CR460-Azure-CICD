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

variable "vm_admin" {
  description = "Nom d'utilisateur administrateur pour la VM"
  type        = string
  default     = "azureuser"
}

variable "vm_password" {
  description = "Mot de passe admin pour la VM"
  type        = string
  sensitive   = true
}
