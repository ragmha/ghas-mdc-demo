metadata description = 'Demo-sized AKS cluster: Entra integration + Azure RBAC, managed identity, OIDC issuer, workload identity, local accounts disabled, one small system node pool.'

@description('AKS cluster name.')
param name string

@description('Azure region.')
param location string

@description('Tags applied to the cluster.')
param tags object = {}

@description('DNS prefix for the managed cluster FQDN.')
param dnsPrefix string

@description('VM size for the system node pool.')
param nodeSize string = 'Standard_B2as_v2'

@description('Node count for the system node pool.')
@minValue(1)
@maxValue(3)
param nodeCount int = 1

@description('Optional pinned Kubernetes version. Empty means "use the AKS default for this region".')
param kubernetesVersion string = ''

@description('Optional Entra group object IDs granted cluster-admin.')
param adminGroupObjectIds array = []

resource aks 'Microsoft.ContainerService/managedClusters@2024-09-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    // Free tier: no uptime SLA. Demo-sized on purpose.
    name: 'Base'
    tier: 'Free'
  }
  identity: {
    // Control plane runs as a managed identity, so there is no service principal secret to rotate or leak.
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: dnsPrefix
    kubernetesVersion: empty(kubernetesVersion) ? null : kubernetesVersion
    enableRBAC: true
    // No cluster-local admin kubeconfig. Every kubectl call is authenticated by
    // Microsoft Entra ID and authorized by Azure RBAC, which is what makes the
    // namespace-scoped role assignment for GitHub Actions meaningful.
    disableLocalAccounts: true
    aadProfile: {
      managed: true
      enableAzureRBAC: true
      adminGroupObjectIDs: adminGroupObjectIds
      tenantID: subscription().tenantId
    }
    // OIDC issuer + workload identity let in-cluster pods federate to Entra ID
    // without secrets. Not required by the demo app, but it is the supported
    // pattern and costs nothing to turn on.
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
      imageCleaner: {
        enabled: true
        intervalHours: 24
      }
      // NOTE: securityProfile.defender is intentionally omitted.
      // It belongs to the optional Defender for Containers plan, which this demo
      // path does not require: Defender CSPM alone covers the GHAS integration
      // and code-to-cloud container mapping. Enabling it is an explicit operator
      // runbook step, never something this template turns on silently.
    }
    apiServerAccessProfile: {
      // DEMO-ONLY: public API server so GitHub-hosted runners can reach it
      // without a self-hosted runner or private endpoint.
      enablePrivateCluster: false
    }
    networkProfile: {
      // Azure CNI Overlay powered by Cilium: GA, IP-efficient, and gives real
      // NetworkPolicy enforcement for the security story.
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      networkDataplane: 'cilium'
      networkPolicy: 'cilium'
      loadBalancerSku: 'standard'
      outboundType: 'loadBalancer'
      serviceCidr: '10.0.0.0/16'
      dnsServiceIP: '10.0.0.10'
    }
    agentPoolProfiles: [
      {
        name: 'system'
        mode: 'System'
        count: nodeCount
        vmSize: nodeSize
        osType: 'Linux'
        osSKU: 'AzureLinux'
        type: 'VirtualMachineScaleSets'
        // Managed (not Ephemeral) OS disk: burstable SKUs have too little cache
        // for ephemeral disks, and this keeps the SKU parameter swappable.
        osDiskType: 'Managed'
        osDiskSizeGB: 64
        maxPods: 50
        enableAutoScaling: false
        enableNodePublicIP: false
        upgradeSettings: {
          maxSurge: '33%'
        }
      }
    ]
    autoUpgradeProfile: {
      upgradeChannel: 'patch'
      nodeOSUpgradeChannel: 'NodeImage'
    }
  }
}

@description('Cluster name.')
output name string = aks.name

@description('Cluster resource ID.')
output resourceId string = aks.id

@description('Object ID of the kubelet (node) identity. Needs AcrPull to start containers from ACR.')
output kubeletIdentityObjectId string = aks.properties.identityProfile.kubeletidentity.objectId

@description('Object ID of the control plane managed identity.')
output clusterIdentityPrincipalId string = aks.identity.principalId

@description('OIDC issuer URL for Kubernetes workload identity.')
output oidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL

@description('Node resource group (MC_*) that AKS creates and owns.')
output nodeResourceGroup string = aks.properties.nodeResourceGroup
