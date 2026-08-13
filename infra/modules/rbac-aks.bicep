metadata description = '''
Least-privilege Azure RBAC on the AKS cluster, using built-in role definition IDs.

Because the cluster runs with disableLocalAccounts + Azure RBAC, kubectl access is
two separate grants:
  1. control plane: permission to fetch a kubeconfig (Cluster User Role)
  2. data plane:    permission to act on Kubernetes objects (RBAC Writer)

The data plane grant is scoped to a single namespace, not the whole cluster.
'''

@description('Name of the existing AKS cluster.')
param aksName string

@description('Kubernetes namespace the workflow is allowed to write to.')
param namespace string

@description('Principal ID of the GitHub Actions deployment identity.')
param workflowPrincipalId string

@description('DEMO CONVENIENCE. Also grant the workflow identity cluster-admin so it can create the namespace itself.')
param grantWorkflowClusterAdmin bool = false

@description('Principal object IDs granted cluster-admin (operators / bootstrap identities).')
param clusterAdminPrincipalIds array = []

// Built-in role definition IDs (stable GUIDs, valid in every Azure tenant).
// Control plane: Microsoft.ContainerService/managedClusters/listClusterUserCredential/action.
// It does NOT include listClusterAdminCredential, so it cannot bypass Azure RBAC.
var aksClusterUserRoleId = '4abbcc35-e782-43d8-92c5-2d3f1bd2253f'
// Data plane: read/write most Kubernetes objects. Notably it can only READ
// namespaces (verified against the live role definition), so it cannot create,
// rename, or delete namespaces even at cluster scope.
var aksRbacWriterRoleId = 'a7ffa36f-339b-4b5c-8bdf-e2c188b2c0eb'
// Data plane: full cluster admin, including namespace creation. Only handed out
// explicitly, never as a default.
var aksRbacClusterAdminRoleId = 'b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b'

resource aks 'Microsoft.ContainerService/managedClusters@2024-09-01' existing = {
  name: aksName
}

// Azure RBAC for Kubernetes authorization accepts a namespace sub-scope
// (<clusterResourceId>/namespaces/<name>). There is no ARM resource type behind
// it, so it is referenced as an untyped existing resource purely to build the scope.
#disable-next-line BCP081
resource aksNamespace 'Microsoft.ContainerService/managedClusters/namespaces@2024-09-01' existing = {
  name: namespace
  parent: aks
}

// Lets the workflow run `az aks get-credentials` (user credential only).
resource workflowClusterUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: aks
  name: guid(aks.id, workflowPrincipalId, aksClusterUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', aksClusterUserRoleId)
    principalId: workflowPrincipalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions OIDC identity: download a user kubeconfig for the demo cluster.'
  }
}

// The actual deploy permission, deliberately confined to one namespace.
// The workflow can manage the orders-portal Deployment and Service and nothing
// else in the cluster.
resource workflowNamespaceWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: aksNamespace
  name: guid(aks.id, namespace, workflowPrincipalId, aksRbacWriterRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', aksRbacWriterRoleId)
    principalId: workflowPrincipalId
    principalType: 'ServicePrincipal'
    description: 'GitHub Actions OIDC identity: deploy workloads into namespace ${namespace} only.'
  }
}

// Opt-in escape hatch so the workflow can apply deploy/k8s/namespace.yaml itself.
// This is broader than the demo needs; prefer bootstrapping the namespace once
// with an operator identity and leaving this false.
resource workflowClusterAdmin 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (grantWorkflowClusterAdmin) {
  scope: aks
  name: guid(aks.id, workflowPrincipalId, aksRbacClusterAdminRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', aksRbacClusterAdminRoleId)
    principalId: workflowPrincipalId
    principalType: 'ServicePrincipal'
    description: 'DEMO CONVENIENCE: GitHub Actions OIDC identity may create the demo namespace.'
  }
}

// Human/bootstrap operators. Required at least once because local accounts are
// disabled: without an Azure RBAC grant, nobody can run kubectl at all.
resource operatorClusterAdmin 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in clusterAdminPrincipalIds: {
    scope: aks
    name: guid(aks.id, principalId, aksRbacClusterAdminRoleId)
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', aksRbacClusterAdminRoleId)
      principalId: principalId
      description: 'Operator: bootstrap and troubleshoot the demo cluster.'
    }
  }
]

// Operators also need the control plane grant to fetch a kubeconfig at all.
resource operatorClusterUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in clusterAdminPrincipalIds: {
    scope: aks
    name: guid(aks.id, principalId, aksClusterUserRoleId)
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', aksClusterUserRoleId)
      principalId: principalId
      description: 'Operator: download a user kubeconfig for the demo cluster.'
    }
  }
]

@description('Human-readable summary of the cluster role assignments.')
output summary array = union(
  [
    'Azure Kubernetes Service Cluster User Role (${aksClusterUserRoleId}) -> GitHub Actions identity, scoped to cluster ${aksName}'
    'Azure Kubernetes Service RBAC Writer (${aksRbacWriterRoleId}) -> GitHub Actions identity, scoped to namespace ${namespace} only'
  ],
  grantWorkflowClusterAdmin
    ? ['Azure Kubernetes Service RBAC Cluster Admin (${aksRbacClusterAdminRoleId}) -> GitHub Actions identity, scoped to cluster ${aksName} (DEMO CONVENIENCE)']
    : [],
  empty(clusterAdminPrincipalIds)
    ? ['No operator cluster-admin assignments were requested; supply clusterAdminPrincipalIds or nobody can run kubectl.']
    : ['Azure Kubernetes Service RBAC Cluster Admin + Cluster User Role -> ${length(clusterAdminPrincipalIds)} operator principal(s)']
)
