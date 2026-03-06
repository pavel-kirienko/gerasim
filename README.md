<div align="center">

<img src="https://opencyphal.org/favicon-192.png" width="60px">

# Cyphal v1.1 distributed consensus visual simulator

🌐 **[gerasim.opencyphal.org](https://gerasim.opencyphal.org/)**

[![Forum](https://img.shields.io/discourse/https/forum.opencyphal.org/users.svg?logo=discourse&color=1700b3)](https://forum.opencyphal.org)

</div>

-----

Simulator and visualizer of the Cyphal v1.1 distributed consensus algorithm. The protocol reference implementation and specification are available in `submodules/cy`.

<img src="static/screenshot.png">

## Usage

Requires Node.js:

```bash
npm install
./build.sh
python3 -m http.server 8080
```

## Testing

```bash
npm test            # run tests once
npm run test:watch  # run tests in watch mode
```
