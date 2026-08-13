metadata description = 'Basic-tier Azure Container Registry for the GHAS + Defender for Cloud demo.'

@description('Globally unique registry name (5-50 lowercase alphanumeric characters).')
@minLength(5)
@maxLength(50)
param name string

@description('Azure region.')
param location string

@description('Tags applied to the registry.')
param tags object = {}

// Basic SKU is deliberate: cheapest tier that still supports the
// GitHub Actions -> ACR -> AKS path and agentless container vulnerability
// assessment, which is available through the Defender CSPM plan. The separate
// Defender for Containers plan is optional and is not required for this demo.
// Basic intentionally does NOT support private endpoints, geo-replication,
// retention policies, or customer-managed keys. Fine for a demo, not for production.
resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    // No admin user: every push and pull is Entra ID + Azure RBAC, never a shared password.
    adminUserEnabled: false
    anonymousPullEnabled: false
    dataEndpointEnabled: false
    // DEMO-ONLY: public network access stays on because images are pushed from
    // GitHub-hosted runners. Production would use Premium + Private Link.
    publicNetworkAccess: 'Enabled'
    networkRuleBypassOptions: 'AzureServices'
    zoneRedundancy: 'Disabled'
  }
}

@description('Registry name.')
output name string = registry.name

@description('Registry login server (e.g. myacr.azurecr.io).')
output loginServer string = registry.properties.loginServer

@description('Registry resource ID.')
output resourceId string = registry.id
