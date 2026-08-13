using './main.bicep'

// Sample parameters for the GHAS + Defender for Cloud demo.
// Copy this file, fill in your GitHub org/repo, and deploy with:
//
//   az deployment sub create \
//     --name ghas-mdc-demo \
//     --location swedencentral \
//     --template-file infra/main.bicep \
//     --parameters infra/main.bicepparam

param prefix = 'ghasmdc'
param location = 'swedencentral'

// REQUIRED: the repository whose GitHub Actions workflow is allowed to deploy.
param githubOrganization = 'REPLACE_WITH_GITHUB_ORG'
param githubRepository = 'ghas-mdc-demo'

// Must match the `environment:` declared by the build+deploy job in the workflow.
param githubEnvironment = 'demo'

// Least privilege: the build+deploy job runs inside the `demo` environment, so the
// environment-scoped OIDC credential is the only subject Azure needs to trust.
// Set to true (and set githubDefaultBranch) only if you split build/push into a
// job that runs outside a GitHub environment.
param federateDefaultBranch = false
param githubDefaultBranch = 'main'

// Must match deploy/k8s/namespace.yaml.
param kubernetesNamespace = 'ghas-mdc-demo'

// Demo-sized compute. Standard_B2as_v2 is 2 vCPU / 8 GiB burstable.
// Burstable v1 SKUs (Standard_B2ms) are not offered in every subscription/region;
// check with: az vm list-skus -l <region> --resource-type virtualMachines -o table
param kubernetesNodeSize = 'Standard_B2as_v2'
param kubernetesNodeCount = 1

// Local accounts are disabled on the cluster, so at least one operator principal
// needs cluster-admin or nobody can run kubectl. Get yours with:
//   az ad signed-in-user show --query id -o tsv
param clusterAdminPrincipalIds = []

// Optional Entra groups granted cluster-admin via aadProfile.adminGroupObjectIDs.
param aksAdminGroupObjectIds = []

// Least privilege by default: the workflow gets namespace-scoped write access only,
// and an operator applies deploy/k8s/namespace.yaml once during bootstrap.
// Set to true only if you want the workflow to create the namespace itself.
param grantWorkflowClusterAdmin = false

param tags = {
  costCenter: 'demo'
  owner: 'REPLACE_WITH_OWNER'
}
