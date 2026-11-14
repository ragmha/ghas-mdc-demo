import assert from "node:assert/strict";
import test from "node:test";
import { verifyInternalService, verifyRuntimeImage } from "../scripts/lib/runtime.mjs";

test("internal access proof rejects public, unassigned and external addresses", () => {
  const service = {
    metadata: { annotations: { "service.beta.kubernetes.io/azure-load-balancer-internal": "true" } },
    spec: {},
    status: { loadBalancer: { ingress: [{ ip: "10.0.0.10" }] } },
  };
  assert.doesNotThrow(() => verifyInternalService(service));
  service.status.loadBalancer.ingress[0].ip = "203.0.113.1";
  assert.throws(() => verifyInternalService(service), /mismatch/);
  service.status.loadBalancer.ingress = [];
  assert.throws(() => verifyInternalService(service), /pending/);
  service.status.loadBalancer.ingress = [{ ip: "10.0.0.10" }];
  service.spec.externalIPs = ["203.0.113.1"];
  assert.throws(() => verifyInternalService(service), /externalIPs/);
  service.spec.externalIPs = [];
  service.metadata.annotations = {};
  assert.throws(() => verifyInternalService(service), /annotation/);
});

test("runtime proof rejects stale rollout, wrong digest and unavailable pods", () => {
  const image = `demo.azurecr.io/orders-portal@sha256:${"a".repeat(64)}`;
  const deployment = {
    metadata: { generation: 2 },
    spec: { replicas: 1, template: { spec: { containers: [{ name: "orders-portal", image }] } } },
    status: { observedGeneration: 2, updatedReplicas: 1, availableReplicas: 1 },
  };
  const pods = { items: [{
    metadata: { name: "orders-portal-demo" },
    status: { containerStatuses: [{ name: "orders-portal", ready: true, imageID: image }] },
  }] };
  assert.match(verifyRuntimeImage(deployment, pods, image), /1 ready pod/);
  assert.throws(() => verifyRuntimeImage(deployment, pods, "latest"), /pinned/);
  assert.throws(() => verifyRuntimeImage(deployment, { items: [] }, image), /unavailable/);
  assert.throws(() => verifyRuntimeImage(deployment, pods, image.replace(/a{64}/, "b".repeat(64))), /mismatch/);
  deployment.status.observedGeneration = 1;
  assert.throws(() => verifyRuntimeImage(deployment, pods, image), /pending/);
  deployment.status.observedGeneration = 2;
  pods.items[0].status.containerStatuses[0].imageID = image.replace(/a{64}/, "b".repeat(64));
  assert.throws(() => verifyRuntimeImage(deployment, pods, image), /mismatch/);
  pods.items[0].status.containerStatuses[0].imageID = image;
  pods.items[0].status.containerStatuses[0].ready = false;
  assert.throws(() => verifyRuntimeImage(deployment, pods, image), /pending/);
});
