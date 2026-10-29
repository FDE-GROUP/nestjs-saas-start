---
kind: external_dependency
name: 制品发布仓库 arligle/odoocn-saas-start
slug: docker-hub
category: external_dependency
scope:
    - '**'
---

### 角色与集成点
- 认证走本机 `credsStore=desktop.exe` 中的既有 docker.io 登录会话；CI 自动发布 workflow（`workflow_dispatch`）待配 `DOCKERHUB_USERNAME/TOKEN` secrets。
- 发布物经 registry 远端 digest 实读对拍，非仅"配置就位"式声称。