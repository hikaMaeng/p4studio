# Checklist

* Docker-first runtime
* one root compose only
* ownership boundary = `apps/*` or `packages/*`
* app service module -> one compose container
* owning module has `docker/Dockerfile`
* owning module has `docker/volumes/`
* `apps/<service>/docker/` contains all service Docker files
* service-local `.env*` lives under `apps/<service>/docker/`
* `apps/<service>/docker/volumes/` holds volume subfolders
* compose only orchestrates module containers
* no out-of-band container flow
* root compose depends on module-owned docker assets
* `env_file`, named volumes, explicit networks
* services that may invoke Docker mount `/var/run/docker.sock:/var/run/docker.sock`
* no Docker-in-Docker daemon for container-spawning services
* default internal network
* external `linker` only when needed
* minimal build context
* standard deploy entry = `npm run deploy`
* deploy = local build + compose refresh
* tests target deployed server from `npm run deploy`
* Dockerfile contains no project build logic
* Dockerfile contains only image-owned runtime tools, not project dependency installation
* Dockerfile copies prebuilt local `dist/`
* Dockerfile never builds `dist/`
* Dockerfile defines runtime start only
