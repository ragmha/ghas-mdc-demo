# Cleanup

Run this **immediately after the demo**. Nothing here self-destructs, and the Azure plans keep billing until you turn them off.

This tears down the **Northstar Orders** demo environment: the disposable private repository, the Azure resources hosting the `orders-portal` workload, the Defender connector, and the paid-plan enablement.

**Order matters.** Delete the workload first, then the registry content, then the connector, then the repo, then the subscription-level plans. Deleting the connector before the resources leaves orphaned findings.

Set these variables once (values are in `demo-generated/deployment-state.json`):

```powershell
$ORG  = "<your-licensed-org>"
$REPO = "<disposable-repo-name>"
$state = Get-Content demo-generated\deployment-state.json | ConvertFrom-Json
$RG   = $state.resourceGroupName
$ACR  = $state.acrName
$AKS  = $state.aksName
$SUB  = $state.subscriptionId

az account set --subscription $SUB
```

> **Fast path:** `node scripts/cleanup-demo.mjs --confirm <resource-group>` deletes the Azure resource group **and** removes the demo GitHub variables — the seven environment variables plus `DEMO_CONFIGURED` and `DEMO_ENVIRONMENT`. It refuses unless the confirmation string exactly matches the resource group in the state file, and it is idempotent (already-absent resources are reported, not treated as errors).
>
> It does **not** delete the GitHub repository, the Defender connector, the criticality rule, or the Defender plans — those are steps 6–10 below and remain deliberate operator actions.
>
> Requires **Node.js 24 LTS**, like all the operator scripts.

---

## 1. Destroy the synthetic key (if scenario 3 was used)

Do this first — it is the only item with any residual sensitivity, even though the key grants access to nothing.

```powershell
node scripts/generate-demo-secret.mjs --clean

# Confirm nothing survived
Get-ChildItem -Recurse -Include "unregistered-demo-private-key.pem","*.pem","id_rsa*" -ErrorAction SilentlyContinue |
  Select-Object FullName
```

Also check for stray copies in your Downloads folder, clipboard managers, and any screen recording you kept.

> The key is unusable by construction — the generator discards the matching public key — but treat it as hygiene practice regardless.
>
> Deleting the commit does **not** clear a secret scanning alert. The reliable cleanup is deleting the **repository** — step 6.

---

## 2. Close the deployment gate

Before tearing anything down, stop the pipeline from redeploying into a half-deleted environment:

```powershell
gh variable set DEMO_CONFIGURED --repo "$ORG/$REPO" --body false
```

The deploy job is guarded by `if: ${{ vars.DEMO_CONFIGURED == 'true' }}`, so any value other than `true` skips it. This matters if anything might still push to `main` while you are mid-cleanup.

> `cleanup-demo.mjs` (step 5) **deletes** `DEMO_CONFIGURED` and `DEMO_ENVIRONMENT` outright, which also closes the gate. Setting it to `false` first is belt-and-braces for the window before you run cleanup.

If you are deleting the repository anyway (step 6), you can skip this — but do it if cleanup will be spread over more than one sitting.

---

## 3. Remove the AKS workload

The `orders-portal` Service is a public LoadBalancer. Removing it releases the public IP, which is both a cost and an exposure.

```powershell
kubectl --kubeconfig demo-generated\kubeconfig delete -f deploy/k8s/service.yaml --ignore-not-found
kubectl --kubeconfig demo-generated\kubeconfig delete -f deploy/k8s/deployment.yaml --ignore-not-found
# or remove everything in one step
kubectl delete namespace ghas-mdc-demo --ignore-not-found
kubectl get namespace ghas-mdc-demo   # expect: NotFound
```

> Deleting `deployment.yaml` by file works even though the applied copy was rendered — `kubectl delete -f` matches on name and kind, not on the image reference.

Confirm the load balancer and public IP were released:

```powershell
az network public-ip list --resource-group "MC_${RG}_${AKS}_<location>" --output table
```

Deleting the whole resource group (step 5) handles this regardless.

---

## 4. Remove images from ACR

```powershell
az acr repository delete --name $ACR --repository orders-portal --yes
az acr repository list --name $ACR --output table
```

> Defender for Cloud is notified when an ACR image is deleted, and VA findings for deleted images are usually removed **within one hour**. In rare cases the notification is delayed and removal takes longer. This is expected — do not chase it.

---

## 5. Delete the Azure resources

Use the repository script — it reads `demo-generated/deployment-state.json`, requires the exact resource group name as confirmation, and also removes the demo GitHub variables:

```powershell
node scripts/cleanup-demo.mjs --confirm $RG
```

It deletes:

- the Azure resource group (and therefore ACR, AKS, the namespace, the LoadBalancer, and the public IP)
- the seven environment variables on the `demo` environment
- the `DEMO_CONFIGURED` and `DEMO_ENVIRONMENT` repository variables

Or delete the resource group directly:

```powershell
az group delete --name $RG --yes --no-wait
```

Verify once it completes:

```powershell
az group exists --name $RG   # expect: false
```

If you must keep the resource group, delete the components individually instead:

```powershell
az aks delete --resource-group $RG --name $AKS --yes --no-wait
az acr delete --resource-group $RG --name $ACR --yes
```

Also clean up the deployment identity used for OIDC federation, if the script did not:

```powershell
az role assignment list --assignee <AZURE_CLIENT_ID> --all --output table
az role assignment delete --assignee <AZURE_CLIENT_ID> --scope "/subscriptions/$SUB/resourceGroups/$RG"

az ad app delete --id <AZURE_CLIENT_ID>
# or, for a user-assigned managed identity
az identity delete --resource-group $RG --name <identity-name>
```

Leaving a federated identity behind with `AcrPush` and cluster access is a real, if small, standing risk. Remove it.

---

## 6. Delete the disposable GitHub repository

This is the authoritative cleanup for **all** GitHub-side artifacts: code scanning alerts, Dependabot alerts, **secret scanning alerts**, generated issues, Copilot agent branches and PRs, Actions history, artifact attestations, and environment variables.

```powershell
gh repo delete "$ORG/$REPO" --yes
```

> `gh repo delete` requires the `delete_repo` scope. If it fails: `gh auth refresh -h github.com -s delete_repo`.

Portal alternative: repo → **Settings** → scroll to **Danger Zone** → **Delete this repository**.

Confirm it is gone:

```powershell
gh repo view "$ORG/$REPO" 2>&1   # expect: not found
```

### If you cannot delete the repository

Only if org policy forbids deletion:

1. Rotate/destroy anything the synthetic key touched — nothing, if instructions were followed.
2. Close all secret scanning alerts as **revoked**.
3. Remove the repo from the org security configuration.
4. Make it private and restrict access to yourself.
5. Archive it.

This is strictly worse than deleting it. Push for deletion.

---

## 7. Remove the resource criticality rule

The classification rule persists in the Microsoft Defender portal after the resource is gone, and will clutter future work.

1. Defender for Cloud → **Environment settings** → **Resource criticality**.
2. Follow the link into the Microsoft Defender portal.
3. Find the rule you created (e.g. `ghas-mdc-demo-critical`).
4. Delete it.

---

## 8. Delete the GitHub connector in Defender for Cloud

Do this **after** the Azure resources and the repo are gone.

1. Azure portal → **Microsoft Defender for Cloud** → **Environment settings**.
2. Locate the GitHub connector you created.
3. Use the context menu → **Delete**.

Then uninstall the GitHub App from the organization:

1. GitHub org → **Settings** → **GitHub Apps** (or **Installed GitHub Apps**).
2. Find the **Microsoft Defender for Cloud** / DevOps security app.
3. **Configure** → **Uninstall**.

> Removing only the connector while leaving the App installed can cause the org to be rediscovered. Do both.
>
> Remember: only **one instance** of a GitHub organization can be onboarded per Azure tenant. If you plan another demo in the same org, you must complete this step first.

---

## 9. Disable Defender for Cloud plans

**This is the step people forget, and it is the one that costs money.**

Portal: **Microsoft Defender for Cloud** → **Environment settings** → select the subscription → set plans to **Off** → **Save**.

Or:

```powershell
# Inspect current tiers first
az security pricing list --query "value[].{name:name, tier:pricingTier}" --output table

# Turn off the plans enabled for this demo
az security pricing create --name CloudPosture      --tier Free
az security pricing create --name Containers        --tier Free
```

> ### Only do this if the subscription was dedicated to the demo.
>
> Defender plans are **subscription-scoped**. If anything else runs in this subscription, disabling CSPM or Defender for Containers removes protection from those workloads too. When in doubt, confirm with the subscription owner before changing plan state.

Verify:

```powershell
az security pricing list --query "value[?pricingTier=='Standard'].name" --output table
```

---

## 10. Revert GitHub paid-plan enablement

Only if the demo was the reason these were enabled.

| Item | Where | Note |
| --- | --- | --- |
| GHAS / Code Security | Org → **Settings** → **Advanced Security** | Billed per **active committer**; check your billing period before assuming charges stop immediately |
| Secret Protection | Org → **Settings** → **Advanced Security** | Same billing model |
| Copilot coding agent policy | Org → **Settings** → **Copilot** | Revert if enabled only for the demo |
| Security configuration | Org → **Settings** → **Advanced Security** → **Configurations** | Delete the demo-specific configuration, if you created one |

Check current usage: org → **Settings** → **Billing and licensing**.

> Do **not** disable org-wide GHAS if other repositories depend on it. Removing the configuration from the (now deleted) demo repo is usually sufficient.

---

## 11. Clean up the security campaign

If you published one at organization level:

1. GitHub org → **Security** → **Campaigns**.
2. Open the demo campaign → close or delete it.

Campaigns are org-scoped and survive repository deletion.

---

## 12. Local cleanup

```powershell
# demo-generated/ holds the state file, kubeconfig, local tooling and any generated key
Remove-Item -Recurse -Force .\demo-generated -ErrorAction SilentlyContinue

cd ..
Remove-Item -Recurse -Force .\$REPO

# Remove the kubectl context for the deleted cluster
kubectl config delete-context $AKS      2>$null
kubectl config delete-cluster $AKS      2>$null

# Remove any locally built demo images
docker images --filter "reference=*orders-portal*" --format "{{.Repository}}:{{.Tag}}"
docker rmi <image>:<tag> --force
docker system prune --force
```

Also clear any `az` / `gh` sessions if you authenticated as a demo-only account:

```powershell
az logout
gh auth status
```

---

## Verification checklist

Run through all of it. Anything left `☐` is either a cost or a risk.

**Azure**

- [ ] `az group exists --name $RG` returns `false`
- [ ] `az security pricing list` shows no unexpected `Standard` tiers
- [ ] No GitHub connector remains under **Environment settings**
- [ ] The resource criticality rule is deleted
- [ ] Federated identity / app registration and its role assignments are removed
- [ ] No orphaned public IPs or load balancers remain

**GitHub**

- [ ] The disposable repository is deleted
- [ ] If the repo was kept: `DEMO_CONFIGURED` / `DEMO_ENVIRONMENT` and the seven environment variables are gone (`gh variable list --repo …` and `--env demo`)
- [ ] The Defender for Cloud GitHub App is uninstalled from the org
- [ ] Any demo security campaign is closed or deleted
- [ ] Any demo-specific security configuration is removed
- [ ] Paid-plan enablement reverted, where the demo was the only reason for it

**Local**

- [ ] The synthetic key and all copies are deleted (`node scripts/generate-demo-secret.mjs --clean`)
- [ ] `demo-generated/` is removed
- [ ] The local clone is deleted
- [ ] kubectl context and cluster entries removed
- [ ] Local Docker images pruned

**Records**

- [ ] Fallback screenshots reviewed — no real tenant, subscription, customer, or hostname values before sharing
- [ ] Any screen recording reviewed for the same
- [ ] Cost reviewed in **Cost Management** to confirm charges stopped

---

## If you are running the demo again

Do **not** reuse the environment. Rebuild from the public template each time.

Reasons:

- Images built before the connector existed have limited mapping support, so a stale environment produces unreliable correlation.
- Only one instance of a GitHub org can be onboarded per Azure tenant — a leftover connector blocks the next setup.
- Stale findings, closed alerts, and existing generated issues change what the UI offers (for example, **Generate GitHub issue** behaves differently when an issue already exists).
- A fresh disposable copy is the entire point of the distribution model.

Start again from [setup.md](setup.md), at **T-48h**.
