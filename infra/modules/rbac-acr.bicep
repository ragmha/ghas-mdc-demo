metadata description = 'Least-privilege Azure RBAC on the container registry, using built-in role definition IDs.'

@description('Name of the existing container registry.')
param acrName string

@description('Principal ID of the GitHub Actions deployment identity. Needs to push images.')
param workflowPrincipalId string

@description('Object ID of the AKS kubelet identity. Needs to pull images.')
param kubeletPrincipalId string

// Built-in role definition IDs (stable GUIDs, valid in every Azure tenant).
// AcrPush = Microsoft.ContainerRegistry/registries/{pull/read, push/write}. No delete, no registry management.
var acrPushRoleId = '8311e382-0749-4cb8-b61a-304f252e45ec'
// AcrPull = Microsoft.ContainerRegistry/registries/pull/read only.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' existing = {
  name: acrName
}

// GitHub Actions pushes the built image. AcrPush is chosen over Contributor/Owner
// so the workflow cannot delete repositories or reconfigure the registry.
resource workflowAcrPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, workflowPrincipalId, acrPushRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPushRoleId)
    principalId: workflowPrincipalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions OIDC identity: push demo container images.'
  }
}

// AKS nodes pull the image. Read-only by design; this replaces an imagePullSecret.
resource kubeletAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, kubeletPrincipalId, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: kubeletPrincipalId
    principalType: 'ServicePrincipal'
    description: 'AKS kubelet identity: pull demo container images (no imagePullSecret needed).'
  }
}

@description('Human-readable summary of the registry role assignments.')
output summary array = [
  'AcrPush (${acrPushRoleId}) -> GitHub Actions identity, scoped to registry ${acrName}'
  'AcrPull (${acrPullRoleId}) -> AKS kubelet identity, scoped to registry ${acrName}'
]
