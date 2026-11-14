import { isIP } from "node:net";

export function verifyInternalService(service) {
  if (service.metadata?.annotations?.["service.beta.kubernetes.io/azure-load-balancer-internal"] !== "true" ||
      service.spec?.externalIPs?.length) {
    throw new Error("Service access boundary mismatch: internal annotation required and externalIPs forbidden.");
  }
  const ingress = service.status?.loadBalancer?.ingress;
  if (!ingress?.length) {
    throw new Error("Internal LoadBalancer pending: no assigned address.");
  }
  if (ingress.some(({ ip }) => isIP(ip ?? "") !== 4 ||
      !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip))) {
    throw new Error("Service access boundary mismatch: expected only private IPv4 addresses.");
  }
}

export function verifyRuntimeImage(deployment, pods, expectedImage) {
  if (!/^.+\/orders-portal@sha256:[a-f0-9]{64}$/.test(expectedImage)) {
    throw new Error("Expected an orders-portal image pinned to a SHA-256 digest.");
  }
  const image = deployment.spec?.template?.spec?.containers?.find(
    (container) => container.name === "orders-portal",
  )?.image;
  if (image !== expectedImage) {
    throw new Error(`Deployment image mismatch: ${image}`);
  }
  if (deployment.status?.observedGeneration !== deployment.metadata?.generation ||
      deployment.status?.updatedReplicas !== deployment.spec?.replicas ||
      deployment.status?.availableReplicas !== deployment.spec?.replicas) {
    throw new Error("Rollout pending: current generation is not fully available.");
  }
  const activePods = pods.items?.filter((pod) => !pod.metadata?.deletionTimestamp);
  if (!activePods?.length) {
    throw new Error("Runtime unavailable: no active application pods.");
  }
  const digest = expectedImage.split("@")[1];
  for (const pod of activePods) {
    const container = pod.status?.containerStatuses?.find(
      (entry) => entry.name === "orders-portal",
    );
    if (!container?.ready || !container.imageID?.endsWith(`@${digest}`)) {
      throw new Error(`Runtime mismatch or pending pod: ${pod.metadata?.name}`);
    }
  }
  return `${expectedImage}; ${activePods.length} ready pod(s)`;
}
