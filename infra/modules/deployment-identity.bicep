metadata description = 'User-assigned managed identity with GitHub Actions OIDC federated identity credentials. No client secrets are ever created.'

@description('Managed identity name.')
param name string

@description('Azure region.')
param location string

@description('Tags applied to the identity.')
param tags object = {}

@description('GitHub organization or user that owns the repository.')
param githubOrganization string

@description('GitHub repository name, without the owner.')
param githubRepository string

@description('GitHub environment the deploy job runs in.')
param githubEnvironment string = 'demo'

@description('Optionally also federate the repository default branch, for teams that split build/push into a job running outside a GitHub environment. Off by default.')
param federateDefaultBranch bool = false

@description('Default branch to federate when federateDefaultBranch is true.')
param githubDefaultBranch string = 'main'

var githubIssuer = 'https://token.actions.githubusercontent.com'
var oidcAudiences = [
  'api://AzureADTokenExchange'
]
var repoSlug = '${githubOrganization}/${githubRepository}'

var environmentSubject = 'repo:${repoSlug}:environment:${githubEnvironment}'
var branchSubject = 'repo:${repoSlug}:ref:refs/heads/${githubDefaultBranch}'

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: name
  location: location
  tags: tags
}

// Bound to the GitHub environment. The deploy job MUST declare
// `environment: <githubEnvironment>` or the token subject will not match and
// azure/login will fail with AADSTS70021.
resource environmentCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'github-environment-${githubEnvironment}'
  properties: {
    issuer: githubIssuer
    subject: environmentSubject
    audiences: oidcAudiences
  }
}

// Optional: lets a build/push job authenticate from the default branch without
// an environment approval gate. Off by default because it is a broader subject
// than the environment credential.
resource branchCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = if (federateDefaultBranch) {
  parent: identity
  name: 'github-branch-${replace(githubDefaultBranch, '/', '-')}'
  properties: {
    issuer: githubIssuer
    subject: branchSubject
    audiences: oidcAudiences
  }
  dependsOn: [
    // Federated credentials on one identity cannot be written in parallel.
    environmentCredential
  ]
}

@description('Identity name.')
output name string = identity.name

@description('Identity resource ID.')
output resourceId string = identity.id

@description('Application (client) ID. This is AZURE_CLIENT_ID for azure/login.')
output clientId string = identity.properties.clientId

@description('Service principal object ID, used as the target of every role assignment.')
output principalId string = identity.properties.principalId

@description('Exact OIDC subject claims Azure will accept.')
output federatedSubjects array = federateDefaultBranch ? [environmentSubject, branchSubject] : [environmentSubject]
