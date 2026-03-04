# Cyphal v1.1 epidemic gossip simulation and visualization tool

This is a simple script that simulates the behavior of Cyphal v1.1 networks, specifically the epidemic gossips around nodes joining/leaving the network and CRDT consensus repairs. The protocol implementation and specification are available in <https://github.com/OpenCyphal-Garage/cy>. Each node broadcasts a gossip message every N seconds. Every other online node receives that gossip, adjusted for network losses. When CRDT consensus issues are found, urgent repairs are initiated, which amount to two things:

- **Constant-cadence broadcast:** The affected entry (topic) is scheduled to broadcast-gossip at the next slot, but it may take up to 3 seconds due to the fixed broadcast cadence, which is slow. Broadcast gossips provide a deterministric upper bound on the worst case convergence times and node discovery times.

- **Immediate epidemic unicast:** The affected entry is also immediately unicast to two randomly chosen peers that the local node knows about. This is similar to Cyclone/HyParView/etc. Such epidemic gossips are forwarded to other nodes subject to deduplication (each node keeps 16 last seen gossips to break cycles early) and TTL (decremented at each forward, used as a last-resort deterministic cycle breaker). If an epidemic message carries information concerning a known topic, it is first validated to ensure it is not obsolete, and amended as necessary (e.g., a CRDT message that is older than the current state is corrected before forwarding).

## Building

Requires Node.js (for `npx`). From the repo root:

```bash
cd cysim
npm install
./build.sh
```

This type-checks with `tsc` and bundles into `cysim/dist/main.js` via esbuild.

## Running

Open `cysim/index.html` in a browser. No server needed — it's a static page.

```bash
xdg-open cysim/index.html        # Linux
open cysim/index.html             # macOS
start cysim/index.html            # Windows
```

Or serve locally if you prefer:

```bash
npx serve cysim
```

## Usage

The simulator starts with 6 nodes and no topics. All interaction is live:

- **Create topics** — click `+Topic` under a node. Enter a name like `temperature` or leave blank for auto-naming. Use `name#hex` (e.g. `pressure#23e7`) to force a specific hash for collision testing.
- **Destroy topics** — click the `×name` button under a node to remove a topic from that node only (other nodes retain their copies).
- **Add/destroy nodes** — `+ Node` in the top bar adds a node; `Destroy` under a node removes it.
- **Restart a node** — clears all state (topics, peers, dedup) and re-joins the network.
- **Network partitions** — click the `[A]`/`[B]` button under a node to toggle its partition set. Nodes in different partition sets cannot communicate. Move one node to `[B]` to disconnect it; move several to `[B]` to create a two-partition split.
- **Time control** — Play/Pause, Step (+3s sim time), Rewind (reset to t=0). Speed slider ranges from 0.1x to 10x.
- **Convergence** — the top bar shows `Converged: YES/NO` indicating whether all online nodes agree on topic→subject-ID mappings.

### Example: collision and resolution

1. Click `+Topic` on N0, enter `temperature#23e7`
2. Click `+Topic` on N3, enter `pressure#43e7`
3. Both topics hash to the same subject-ID — watch the conflict flash (red) and epidemic repair converge within ~6–9s

### Example: network partition

1. Create a topic on N0 and let it propagate to all nodes
2. Click `[A]` on N3 and N4 to toggle them to `[B]`
3. Observe N3/N4 peer lists going stale, no gossips crossing the partition
4. Toggle N3/N4 back to `[A]` — watch re-convergence

### Example: late join

1. Let the network run with topics for a few seconds
2. Click `+ Node` to add N6
3. Watch N6 discover peers and learn all existing topics via broadcast gossip
