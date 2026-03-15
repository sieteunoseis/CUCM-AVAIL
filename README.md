# CUCM Availability Dashboard

Real-time visibility into Cisco Unified Communications Manager (CUCM) phone registration, failover status, and upgrade planning.

![Node.js](https://img.shields.io/badge/Node.js-22-green)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Dashboard** — Live server status, phone registration counts, and failover detection with drill-down to individual phones
- **Availability Groups** — Visualize how CM Groups share servers with priority matrix, blast zone analysis, and safe upgrade pair identification
- **Failover Simulation** — Toggle servers offline to model phone re-registration impact across CMGs and subnets
- **Upgrade Sequencer** — Calculate optimal sequential or parallel upgrade order with estimated duration and phone impact per step
- **SIP Trunk Monitor** — Real-time trunk registration status with per-server filtering
- **Firmware Planner** — Blast radius analysis for firmware pushes by model and device pool
- **CMG Rebalance Planner** — Subnet-based bin-packing to minimize server load imbalance across CM Groups
- **Subnet Management** — CIDR-based location mapping with automatic subnet discovery via phone scraping

## Architecture

```
┌─────────────┐     AXL/SOAP      ┌──────────────┐
│  CUCM Pub   │◄──────────────────│              │
│  + Subs     │     RISPort       │   Express    │
│             │◄──────────────────│   Server     │
└─────────────┘                   │              │
                                  │  Socket.IO   │──► SQLite
┌─────────────┐     HTTP          │              │
│  IP Phones  │◄──────────────────│              │
│  (scrape)   │                   └──────┬───────┘
└─────────────┘                          │
                                         │ REST + WS
                                  ┌──────┴───────┐
                                  │    React     │
                                  │   Frontend   │
                                  └──────────────┘
```

- **AXL** — Syncs servers, device pools, CM Groups, phones, and trunks from CUCM admin SOAP API
- **RISPort** — Polls real-time registration status (which server each phone is on)
- **Phone Scrape** — HTTP to phone web servers for subnet mask discovery
- **Socket.IO** — Pushes registration updates, poller logs, and scrape progress to the browser

## Quick Start with Docker

The easiest way to run the dashboard is with Docker Compose. See [`docker/`](docker/) for a ready-to-use setup.

```bash
cp docker/.env.example docker/.env
# Edit docker/.env with your CUCM credentials
docker compose -f docker/docker-compose.yml up -d
```

Open [http://localhost:3000](http://localhost:3000)

## Docker Image

Pre-built images are published to GitHub Container Registry on every tag:

```bash
docker pull ghcr.io/sieteunoseis/cucm-avail:latest
```

## Development

### Prerequisites

- Node.js 22+
- npm 10+
- Access to a CUCM cluster (AXL + RISPort APIs)

### Setup

```bash
git clone https://github.com/sieteunoseis/CUCM-AVAIL.git
cd CUCM-AVAIL

# Install dependencies
npm install
cd client && npm install && cd ..

# Configure environment
cp docker/.env.example .env
# Edit .env with your CUCM credentials

# Run dev server (poller disabled)
npm run dev

# Run dev server (with RISPort polling)
npm run dev:full
```

The client dev server runs on `:5173` and the API server on `:3000`.

### Initial Data Sync

On first run, trigger an AXL sync to pull server/CMG/phone data:

```bash
npm run sync
```

Or use the **Sync AXL** button on the dashboard.

### Build for Production

```bash
npm run build
npm start
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `CUCM_PUB` | Yes | — | CUCM publisher FQDN or IP |
| `CUCM_USERNAME` | Yes | — | AXL API username |
| `CUCM_PASSWORD` | Yes | — | AXL API password |
| `CUCM_VERSION` | No | `15.0` | CUCM AXL schema version |
| `PORT` | No | `3000` | HTTP server port |
| `DB_PATH` | No | `./data/prod.db` | SQLite database file path |
| `POLL_INTERVAL` | No | `1440` | RISPort poll interval in minutes |

## Tech Stack

- **Frontend**: React 19, Tailwind CSS 4, Vite 8, Socket.IO Client
- **Backend**: Express 4, Socket.IO, better-sqlite3
- **CUCM APIs**: [cisco-axl](https://www.npmjs.com/package/cisco-axl), [cisco-risport](https://www.npmjs.com/package/cisco-risport)
- **Infrastructure**: Docker, GitHub Actions, GHCR
