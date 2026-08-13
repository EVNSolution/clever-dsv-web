# DSV 운영 배포 Runbook

| 항목 | 값 |
| --- | --- |
| Runbook version | `1.1.0` |
| 상태 | Active |
| 최종 검증일 | 2026-08-13 |
| 대상 | `clever-route-server`, `clever-dsv-web` |
| 운영 웹 | `https://dsv.cleversystem.ai` |
| 운영 API | `https://clever-route-api.cleversystem.ai` |
| AWS region | `ap-northeast-2` |

이 문서는 에이전트가 DSV 배포 방식을 매번 다시 조사하거나 중복 컨테이너를 만드는 일을 막기 위한 정본이다. 실행 파일이 아니며, 자격 증명과 일회성 서명 URL을 저장하지 않는다.

## 버전 규칙

- 배포 토폴로지, 컨테이너 이름, 호스트 경로, GitHub Actions 입력 또는 검증 계약이 바뀌면 Runbook 버전을 올린다.
- 문구 보정은 patch, 절차의 호환 가능한 추가는 minor, 기존 절차를 대체하는 변경은 major로 올린다.
- 배포할 때마다 Runbook 버전을 올리지 않는다.
- 실행 증거는 `docs/runbooks/.local/`에 남긴다. 이 경로는 Git에서 제외한다.

## 배포 경계

### 백엔드

- 저장소: `../clever-route-server`
- 정본 브랜치: `main`
- 배포 수단: GitHub Actions의 `Route Ops simple deploy`
- 운영 컨테이너: `clever-route-clever-route-api-1`
- 배포 리비전 근거: 컨테이너 라벨 `org.opencontainers.image.revision`

### 프런트엔드

- 저장소: 현재 저장소 `clever-dsv-web`
- 정본 브랜치: `main`
- 배포 수단: 운영용 Vite 빌드 압축본을 S3에 올린 뒤 SSM으로 정적 nginx 릴리스를 교체
- 운영 컨테이너: `clever-dsv-web`
- Docker image: `nginx:1.27-alpine`
- Docker network: `clever-route_default`
- restart policy: `unless-stopped`
- nginx 설정: `/srv/clever-dsv-web/nginx.conf`
- 릴리스 디렉터리: `/srv/clever-dsv-web/releases/<release-id>`
- 현재 릴리스 링크: `/srv/clever-dsv-web/current`
- 정적 파일 mount: `/usr/share/nginx/html:ro`
- 배포 artifact bucket: `clever-route-prod-artifacts-902837199612-ap-northeast-2`
- 배포 artifact key: `dsv-web/releases/<release-id>.tgz`

프런트엔드는 백엔드 배포 workflow에 포함되지 않는다. 두 저장소가 모두 변경되면 각각 배포해야 한다.

### 공개 진입점

- 저장소: `../clever-route-server`
- 설정: `infra/caddy/Caddyfile`의 `dsv.cleversystem.ai` 블록
- 배포 수단: GitHub Actions의 `Edge Caddy deploy`
- 적용 범위: DSV 정적 응답의 브라우저 보안 헤더

공개 진입점은 백엔드와 같은 저장소에 있지만 별도 workflow를 사용한다. DSV
보안 헤더 변경을 백엔드 `Route Ops simple deploy`나 프런트 정적 릴리스 교체로
대신하지 않는다. Shopify 호스트 블록은 DSV 헤더를 상속하지 않는다.

## 공통 사전 확인

1. 사용자가 운영 배포를 명시적으로 요청했는지 확인한다.
2. 두 저장소에서 대상 commit이 `origin/main`에 존재하는지 확인한다.
3. 관련 CI와 로컬 자동 검증이 성공했는지 확인한다.
4. 작업 트리의 다른 변경을 섞지 않는다.
5. 기존 운영 컨테이너를 조사한다는 이유로 새 컨테이너를 추가 기동하지 않는다.

```bash
git -C ../clever-route-server status --short --branch
git -C . status --short --branch
git -C ../clever-route-server rev-parse HEAD
git -C . rev-parse HEAD
```

## 백엔드 배포

### 1. restore rehearsal 증거 확인

`restore_rehearsal_sha256`은 임의로 만들거나 오래된 값을 추측하지 않는다. 최근 승인된 운영 배포 또는 복구 리허설 증거에서 확인한다. Runbook 1.0.0 검증 시 사용한 값은 아래와 같다.

```text
50ececbe976da624a4addb38723967b8f454eed8ae1df51deaaf02da4393cbb9
```

증거가 변경되었으면 현재 승인값으로 교체하고 이 문서의 minor 버전을 올린다.

### 2. workflow 실행

서버 저장소에서 아래 workflow만 사용한다.

```bash
cd ../clever-route-server

gh workflow run "Route Ops simple deploy" --ref main \
  -f channel_tag=prod \
  -f source_ref=main \
  -f publish_images=true \
  -f dry_run=false \
  -f approve_dsv_migration=true \
  -f restore_rehearsal_sha256=<approved-sha256> \
  -f approve_production_baseline=false
```

새 run ID를 확인하고 완료될 때까지 기다린다.

```bash
gh run list --workflow "Route Ops simple deploy" --limit 3
gh run watch <run-id> --exit-status
```

실패한 workflow를 성공으로 간주하거나 SSM 수동 재배포로 우회하지 않는다. 먼저 workflow 로그의 실패 원인을 해결한다.

## 프런트엔드 배포

### 1. 운영 빌드와 릴리스 생성

`release-id`는 UTC 시각과 commit 단축 SHA로 만든다. 예: `20260804T043550Z-d0ec9e1e`.

```bash
cd ../clever-dsv-web
npm ci
VITE_DSV_API_MODE=remote npm run build

COMMIT_SHA="$(git rev-parse --short=8 HEAD)"
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-${COMMIT_SHA}"
ARCHIVE="/tmp/${RELEASE_ID}.tgz"
COPYFILE_DISABLE=1 tar -C dist -czf "$ARCHIVE" .
shasum -a 256 "$ARCHIVE"
```

### 2. S3 업로드

```bash
BUCKET=clever-route-prod-artifacts-902837199612-ap-northeast-2
KEY="dsv-web/releases/${RELEASE_ID}.tgz"

aws s3 cp "$ARCHIVE" "s3://${BUCKET}/${KEY}" --region ap-northeast-2
aws s3api head-object \
  --region ap-northeast-2 \
  --bucket "$BUCKET" \
  --key "$KEY"
```

### 3. SSM 대상 확인

고정 instance ID를 문서나 명령에 새로 박지 않는다. `Service=clever-delivery-server` 태그로 온라인 대상 한 대를 해석한다.

```bash
INSTANCE_ID="$(aws ssm describe-instance-information \
  --region ap-northeast-2 \
  --filters Key=tag:Service,Values=clever-delivery-server \
  --query 'InstanceInformationList[?PingStatus==`Online`].InstanceId | [0]' \
  --output text)"
test -n "$INSTANCE_ID" && test "$INSTANCE_ID" != None
```

### 4. 정적 릴리스 교체

아래 불변 조건을 지키는 단일 `AWS-RunShellScript` 명령으로 교체한다.

1. S3 object의 presigned URL을 만든다. URL은 저장하거나 커밋하지 않는다.
2. `/srv/clever-dsv-web/releases/<release-id>.staging`에 압축을 푼다.
3. 로컬에서 계산한 SHA-256과 서버에서 받은 archive의 SHA-256을 비교한다.
4. `index.html`이 없으면 중단한다.
5. `clever-dsv-web-candidate`를 기존 network, nginx 설정, staging mount로 잠시 실행한다.
6. candidate의 `/` 응답이 새 `index.html`의 asset 이름을 포함하는지 확인한다.
7. 검증된 staging을 최종 release 디렉터리로 이동하고 `current` symlink를 교체한다.
8. 기존 `clever-dsv-web` 컨테이너를 제거한 뒤 같은 이름으로 정확히 한 개만 다시 만든다.
9. network는 `clever-route_default`, restart policy는 `unless-stopped`, mount는 모두 read-only로 유지한다.
10. 새 컨테이너의 `/` 응답을 다시 확인한다.
11. candidate와 `/tmp` archive를 제거한다.

임시 candidate는 검증 중에만 존재해야 한다. 완료 후 아래 결과에서 `clever-dsv-web`이 정확히 한 개여야 한다.

```bash
docker ps --format '{{.Names}}' | grep -x 'clever-dsv-web'
docker ps -a --format '{{.Names}}' | grep -x 'clever-dsv-web-candidate' && exit 1 || true
```

SSM shell은 기본적으로 `/bin/sh`에서 실행될 수 있으므로 `set -o pipefail`을 사용하지 않는다. `set -eu`를 사용한다.

## DSV 보안 헤더 배포

이 절차는 `infra/caddy/Caddyfile`의 DSV 블록이 변경된 경우에만 수행한다. 먼저
후보 설정을 운영 서버에서 검증하되 공개 진입점은 변경하지 않는다.

```bash
cd ../clever-route-server

gh workflow run "Edge Caddy deploy" --ref main \
  -f source_ref=main \
  -f dry_run=true \
  -f skip_smoke=false
```

dry-run 성공 후 같은 workflow를 실제 reload로 실행한다. 이 단계는 Caddy를
재시작하지 않으며, DSV 보안 헤더 또는 기존 Route·Shopify 호스트 smoke가 실패하면
직전 Caddyfile로 복구한다.

```bash
gh workflow run "Edge Caddy deploy" --ref main \
  -f source_ref=main \
  -f dry_run=false \
  -f skip_smoke=false
```

## 배포 후 자동 검증

화면 디자인 검증은 사용자가 수행한다. 에이전트는 아래 런타임 검증까지만 담당한다.

### 백엔드

```bash
curl -fsS --retry 3 --retry-delay 2 \
  https://clever-route-api.cleversystem.ai/healthz

docker inspect clever-route-clever-route-api-1 \
  --format '{{.State.Health.Status}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

기대 결과는 `status=ok`, 컨테이너 `healthy`, 배포 대상 commit의 전체 SHA다.

### 프런트엔드

```bash
curl -fsS --retry 3 --retry-delay 2 https://dsv.cleversystem.ai/
readlink -f /srv/clever-dsv-web/current
docker inspect clever-dsv-web \
  --format '{{.State.Status}} {{.HostConfig.RestartPolicy.Name}} {{.HostConfig.NetworkMode}}'
```

기대 결과는 public HTML이 새 빌드 asset을 가리키고, `current`가 새 release를 가리키며, 컨테이너가 `running unless-stopped clever-route_default`인 상태다.

### DSV 보안 헤더

```bash
curl -fsSI https://dsv.cleversystem.ai/ | grep -Ei \
  '^(content-security-policy|permissions-policy|referrer-policy|x-content-type-options|x-frame-options):'
```

기대 결과는 CSP가 스크립트를 동일 출처로 제한하고 framing을 거부하며,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`가 함께 반환되는 상태다.

## 중단과 복구

- 백엔드 workflow 실패 시 운영 상태를 임의로 수동 변경하지 않는다. workflow 로그를 기준으로 복구한다.
- 프런트 candidate 검증 실패 시 기존 `clever-dsv-web`은 건드리지 않고 staging만 제거한다.
- 프런트 교체 후 검증 실패 시 직전 `current` 대상 release로 동일한 nginx 컨테이너를 다시 만든다.
- 운영 컨테이너 이름을 바꾸거나 `clever-dsv-web-2` 같은 중복 컨테이너를 남기지 않는다.
- 릴리스 정리와 Docker image prune은 배포와 별도 작업이다. 배포 과정에서 임의로 수행하지 않는다.

## 검증된 배포 기록

| 날짜 | Runbook | 백엔드 commit | 프런트 commit | 프런트 release | 결과 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-04 | `1.0.0` | `59e10a7b4ee620682a8560a9f3754ed5cadaac9b` | `d0ec9e1e76c6bb1ac7bb45854f9eda15a44ac8b4` | `20260804T043550Z-d0ec9e1e` | 성공 |

## 변경 이력

- `1.1.0` — DSV 도메인 전용 보안 헤더의 Edge Caddy 배포와 검증 절차를 추가했다.
- `1.0.0` — 백엔드 GitHub Actions 배포, 프런트 S3/SSM 정적 릴리스 교체, 중복 컨테이너 방지 및 검증 절차를 최초 고정했다.
