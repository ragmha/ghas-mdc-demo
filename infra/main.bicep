metadata name = 'GHAS + Microsoft Defender for Cloud demo platform'
metadata description = '''
Subscription-scoped entry point for the GHAS + Defender for Cloud demo.

Provisions the supported delivery path:
  GitHub -> GitHub Actions (OIDC) -> Azure Container Registry -> Azure Kubernetes Service -> Defender for Cloud

Deliberately DEMO-SIZED, not production-sized:
  * Basic ACR (no geo-replication, no private endpoints, no customer-managed keys)
  * Single-node AKS system pool on a burstable VM SKU
  * Public authenticated API server; internal LoadBalancer application access

Deliberately NOT done here (licensed and/or interactive runbook steps):
  * Defender CSPM plan enablement, plus agentless code scanning and agentless
    container coverage (Microsoft.Security/pricings). Defender CSPM is the
    prerequisite for the GA GitHub Advanced Security integration.
  * The Microsoft Defender for Cloud <-> GitHub connector (Microsoft.Security/securityConnectors)
  * GHAS enablement on the GitHub repository
Those are enabled explicitly by an operator so the demo never silently incurs licensed cost.
The Defender for Containers plan is optional and is NOT required by this path.
'''

targetScope = 'subscription'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

@description('Short lowercase prefix used to derive every resource name. Letters and numbers only.')
@minLength(3)
@maxLength(11)
param prefix string = 'ghasmdc'

@description('Azure region for the resource group and all resources.')
param location string = deployment().location

@description('Name of the resource group to create.')
param resourceGroupName string = 'rg-${prefix}'

@description('GitHub organization (or user) that owns the demo repository. Used for the OIDC federated credential subject.')
param githubOrganization string

@description('GitHub repository name (without the owner). Used for the OIDC federated credential subject.')
param githubRepository string

@description('GitHub environment that the deploy job runs in. The federated credential subject is repo:<org>/<repo>:environment:<env>.')
param githubEnvironment string = 'demo'

@description('''Optionally also federate the repository default branch (subject repo:<org>/<repo>:ref:refs/heads/<branch>).
Defaults to false: the demo build+deploy job declares `environment: demo`, so the environment credential alone is sufficient
and a second, broader subject would grant any run on the default branch the same Azure access without the environment gate.
Set to true only if you split the build/push job outside the GitHub environment.''')
param federateDefaultBranch bool = false

@description('Default branch to federate when federateDefaultBranch is true.')
param githubDefaultBranch string = 'main'

@description('Kubernetes namespace the demo application is deployed into. Must match deploy/k8s/namespace.yaml.')
param kubernetesNamespace string = 'ghas-mdc-demo'

@description('VM size for the single AKS system node pool. Burstable SKUs keep the demo cheap; AKS requires >= 2 vCPU / 4 GiB for a system pool. Verify availability with: az vm list-skus -l <region> --resource-type virtualMachines --query "[?name==\'<size>\']".')
param kubernetesNodeSize string = 'Standard_B2as_v2'

@description('Node count for the AKS system pool. Demo default is a single node.')
@minValue(1)
@maxValue(3)
param kubernetesNodeCount int = 1

@description('Optional pinned Kubernetes version. Leave empty to take the AKS default for the region.')
param kubernetesVersion string = ''

@description('Optional Microsoft Entra group object IDs granted cluster-admin on the AKS cluster (aadProfile.adminGroupObjectIDs).')
param aksAdminGroupObjectIds array = []

@description('Optional principal object IDs (humans or service principals) granted "Azure Kubernetes Service RBAC Cluster Admin". Needed at least once to bootstrap the demo namespace, because local accounts are disabled.')
param clusterAdminPrincipalIds array = []

@description('''DEMO CONVENIENCE. When true, the GitHub Actions identity also gets "Azure Kubernetes Service RBAC Cluster Admin" at cluster scope so the workflow can create the namespace itself.
Leave false for least privilege: the identity then only gets namespace-scoped write access and an operator creates the namespace once.''')
param grantWorkflowClusterAdmin bool = false

@description('Optional tags merged onto every resource.')
param tags object = {}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

var resourceToken = toLower(uniqueString(subscription().id, prefix, resourceGroupName))

var defaultTags = {
  workload: 'ghas-mdc-demo'
  environment: githubEnvironment
  demoOnly: 'true'
  managedBy: 'bicep'
  sourceRepository: '${githubOrganization}/${githubRepository}'
}

var allTags = union(defaultTags, tags)

var acrName = toLower('${prefix}acr${resourceToken}')
var aksName = '${prefix}-aks'
var identityName = '${prefix}-gh-deploy-id'

// ---------------------------------------------------------------------------
// Resource group
// ---------------------------------------------------------------------------

resource rg 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: resourceGroupName
  location: location
  tags: allTags
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

module registry 'modules/acr.bicep' = {
  scope: rg
  name: 'acr'
  params: {
    name: acrName
    location: location
    tags: allTags
  }
}

module cluster 'modules/aks.bicep' = {
  scope: rg
  name: 'aks'
  params: {
    name: aksName
    location: location
    tags: allTags
    dnsPrefix: '${prefix}-${resourceToken}'
    nodeSize: kubernetesNodeSize
    nodeCount: kubernetesNodeCount
    kubernetesVersion: kubernetesVersion
    adminGroupObjectIds: aksAdminGroupObjectIds
  }
}

module deploymentIdentity 'modules/deployment-identity.bicep' = {
  scope: rg
  name: 'deployment-identity'
  params: {
    name: identityName
    location: location
    tags: allTags
    githubOrganization: githubOrganization
    githubRepository: githubRepository
    githubEnvironment: githubEnvironment
    federateDefaultBranch: federateDefaultBranch
    githubDefaultBranch: githubDefaultBranch
  }
}

module acrRbac 'modules/rbac-acr.bicep' = {
  scope: rg
  name: 'rbac-acr'
  params: {
    acrName: registry.outputs.name
    workflowPrincipalId: deploymentIdentity.outputs.principalId
    kubeletPrincipalId: cluster.outputs.kubeletIdentityObjectId
  }
}

module aksRbac 'modules/rbac-aks.bicep' = {
  scope: rg
  name: 'rbac-aks'
  params: {
    aksName: cluster.outputs.name
    namespace: kubernetesNamespace
    workflowPrincipalId: deploymentIdentity.outputs.principalId
    grantWorkflowClusterAdmin: grantWorkflowClusterAdmin
    clusterAdminPrincipalIds: clusterAdminPrincipalIds
  }
}

// ---------------------------------------------------------------------------
// Outputs - the contract for the GitHub Actions workflow and the runbook
// ---------------------------------------------------------------------------

@description('Azure subscription ID. Workflow secret/variable: AZURE_SUBSCRIPTION_ID.')
output subscriptionId string = subscription().subscriptionId

@description('Microsoft Entra tenant ID. Workflow secret/variable: AZURE_TENANT_ID.')
output tenantId string = subscription().tenantId

@description('Resource group holding every demo resource. Workflow variable: AZURE_RESOURCE_GROUP.')
output resourceGroupName string = rg.name

@description('Deployment region.')
output location string = location

@description('Container registry name (without domain suffix). Workflow variable: ACR_NAME.')
output acrName string = registry.outputs.name

@description('Container registry login server, e.g. myacr.azurecr.io. Workflow variable: ACR_LOGIN_SERVER.')
output acrLoginServer string = registry.outputs.loginServer

@description('Fully qualified image repository the demo app is published to. The workflow appends @sha256:<digest>.')
output containerImageRepository string = '${registry.outputs.loginServer}/orders-portal'

@description('AKS cluster name. Workflow variable: AKS_NAME.')
output aksClusterName string = cluster.outputs.name

@description('AKS OIDC issuer URL, for Kubernetes workload identity federation.')
output aksOidcIssuerUrl string = cluster.outputs.oidcIssuerUrl

@description('Kubernetes namespace the demo app is deployed into. Workflow variable: K8S_NAMESPACE.')
output kubernetesNamespace string = kubernetesNamespace

@description('Client ID of the user-assigned managed identity used by GitHub Actions OIDC login. Workflow secret/variable: AZURE_CLIENT_ID.')
output deploymentIdentityClientId string = deploymentIdentity.outputs.clientId

@description('Principal (object) ID of the GitHub Actions deployment identity, for auditing role assignments.')
output deploymentIdentityPrincipalId string = deploymentIdentity.outputs.principalId

@description('Resource ID of the GitHub Actions deployment identity.')
output deploymentIdentityResourceId string = deploymentIdentity.outputs.resourceId

@description('GitHub environment the federated credential is bound to. The deploy job MUST declare `environment: <this value>`.')
output githubEnvironment string = githubEnvironment

@description('OIDC subject claims Azure will accept from GitHub Actions.')
output githubOidcSubjects array = deploymentIdentity.outputs.federatedSubjects

@description('True when the workflow may create the namespace itself. When false, an operator must apply deploy/k8s/namespace.yaml once before the first workflow deploy.')
output workflowCanCreateNamespace bool = grantWorkflowClusterAdmin

@description('Role assignments created by this deployment, for the runbook and for review.')
output roleAssignmentSummary array = union(acrRbac.outputs.summary, aksRbac.outputs.summary)

@description('Reminder that Defender plans and the GitHub connector are intentionally NOT provisioned here.')
output manualFollowUpSteps array = [
  'REQUIRED: Enable the Defender CSPM plan on subscription ${subscription().subscriptionId} (licensed). This is the prerequisite for the GA GitHub Advanced Security integration.'
  'REQUIRED: Enable agentless code scanning so GHAS findings flow into Defender for Cloud.'
  'REQUIRED: Enable agentless container coverage (agentless discovery for Kubernetes + agentless container vulnerability assessment) so code-to-cloud container mapping can link the running pod back to the image and repository. Defender CSPM alone satisfies this.'
  'REQUIRED: Create the Microsoft Defender for Cloud GitHub connector for ${githubOrganization}/${githubRepository} (interactive OAuth consent; needs GitHub organization owner).'
  'REQUIRED: Enable GitHub Advanced Security on ${githubOrganization}/${githubRepository}.'
  'OPTIONAL: The Defender for Containers plan is NOT needed for this demo path. It adds runtime threat detection and extra cost. Enable it only if you also want the runtime detection story.'
  grantWorkflowClusterAdmin ? 'Namespace ${kubernetesNamespace} will be created by the workflow (grantWorkflowClusterAdmin = true).' : 'Apply deploy/k8s/namespace.yaml once with a cluster-admin identity to create namespace ${kubernetesNamespace}.'
]
