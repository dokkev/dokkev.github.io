# 블로그 편집 검토 기록 — 2026-11-09

[공통 글쓰기 가이드](style-guide.md)를 기준으로 `content/blog`의 날짜가 붙은 원고 43편을 검토했습니다. 미공개 초안 2편을 포함했고, 보관된 Jekyll 원고·템플릿·시리즈 지침은 편집 대상에서 제외했습니다. 이번 검토에서 32편을 수정하고 11편은 유지했습니다. CMD 글은 직전 작업의 수정본을 기준으로 검토했으며 추가 수정하지 않았습니다.

## 독자와 검토 질문

| 글 묶음 | 독자와 설명 목적 |
| --- | --- |
| CAN | 로봇 통신을 구현하는 개발자가 배선·프레임·I/O 스케줄 문제를 구분하도록 설명 |
| WBC | 제어 수식을 구현하는 개발자가 상태·task·solver의 책임을 연결하도록 설명 |
| Robot Hardware | 하드웨어 배경이 깊지 않은 로봇 학습 연구자가 모델과 실제 관절의 차이를 식별하도록 설명 |
| Fingertip Design | 접촉·촉각 센싱 연구자가 수치 검증·기계적 구분 가능성·센싱 성능을 구분하도록 설명 |
| CMD | 로봇 접촉 설계의 관점을 읽는 독자가 설계 변수·접촉 응답·시스템 영향과 가설을 구분하도록 설명 |
| 입문 자료·로봇 손 초안 | 입문자가 자료의 주제와 범위를 찾고, 손의 기능에 맞춰 설계 질문을 세우도록 설명 |

## 수정 범위와 근거

구조와 주장 범위를 먼저 검토한 뒤 문장을 수정했습니다. 특정 단어, 문장 길이, 질문형 표현을 일괄 삭제하지 않았습니다. 한·영 대응 원고에서 바꾼 과학적 조건과 주장의 강도는 함께 수정했습니다. 로봇 손 초안은 같은 정의와 선택 논리를 반복하고 있어 문단을 합쳤습니다.

새로운 측정값을 만들지 않았습니다. 근거 없는 0.2 mm 공차 예시와 실험 기록처럼 읽히는 30초/10분 도입을 정리했습니다. 케이블 초안의 반복 결론에 있던 토크·합력 수식 두 블록은 삭제했고, 해당 관계를 설명하는 본문 수식은 유지했습니다.

다음 자료는 해당 수정과 관련된 범위에서 확인했습니다. 모든 참고문헌과 외부 링크를 재검증한 것은 아닙니다.

- [DDHand 원 논문](https://roboticsproceedings.org/rss15/p53.pdf): 로봇 손 초안의 직접 구동·force–motion transparency 설명.
- [Capler-Leg 원 논문, II–III절](https://arxiv.org/html/1806.10632v1): 케이블 초안의 시험 결과와 순모멘트 설명. 원문의 순모멘트 설명을 베어링 합력 상쇄의 증거로 사용하지 않도록 수정했습니다.
- [maxon Motor Data and Operating Ranges, 19·22–25쪽](https://www.maxongroup.com/medias/sys_master/8798985748510.pdf): 온도 의존성과 열적 운전 조건. 예시의 변화율을 모든 모터의 보편 사양으로 서술하지 않도록 수정했습니다.
- [Schneider Electric의 STO 설명](https://www.se.com/ae/en/faqs/FA400496/): 토크 차단과 즉시 정지를 구분했습니다.
- [UC Berkeley CS 287, Fall 2019](https://people.eecs.berkeley.edu/~pabbeel/cs287-fa19/): 기존 강좌 URL의 제목을 확인했습니다.

## 원고별 기록

‘유지’는 이번 편집에서 바꾸지 않았다는 뜻이며, 모든 기술적 주장을 독립 검증했다는 뜻은 아닙니다.

| 원고 | 처리 | 검토·수정 내용 |
| --- | --- | --- |
| [2024-03-01-hand1.md](../../content/blog/2024-03-01-hand1.md) | 수정 | 반복된 정의와 선택 논리를 합치고 hand/gripper 구분을 작업 정의로 한정. DDHand 원문 링크 추가. |
| [2024-04-12-Intro-to-Robotics.md](../../content/blog/2024-04-12-Intro-to-Robotics.md) | 수정 | 독자와 자료 구성을 명시. 용어 오탈자·강좌 링크·ROS 배포판 표기 수정. |
| [2026-08-17-contact-morphology-design.mdx](../../content/blog/2026-08-17-contact-morphology-design.mdx) | 유지 | 이전 수정본의 개념 구분·가설 범위·마지막 두 질문 확인. |
| [CAN/2023-09-01-aboutcan.mdx](../../content/blog/CAN/2023-09-01-aboutcan.mdx) | 수정 | 파형 소개를 비교 대상 중심으로 수정. |
| [CAN/2023-09-02-socketcan.md](../../content/blog/CAN/2023-09-02-socketcan.md) | 유지 | 설정과 수신 확인, 예시 로그의 범위 확인. |
| [CAN/2023-09-10-esp32can.md](../../content/blog/CAN/2023-09-10-esp32can.md) | 유지 | 핀·비트레이트·전압 조건과 역사적 예제의 설명 확인. |
| [CAN/2023-12-05-motorcan.md](../../content/blog/CAN/2023-12-05-motorcan.md) | 유지 | 코드 수정 사항과 전류/토크 단위 구분 확인. |
| [CAN/2024-01-14-pcan.md](../../content/blog/CAN/2024-01-14-pcan.md) | 수정 | 네이티브 지원 여부를 반복하는 문단 삭제. |
| [CAN/2024-09-01-roscan.mdx](../../content/blog/CAN/2024-09-01-roscan.mdx) | 수정 | 데모·해상도 설명의 중복 축소. |
| [CAN/2024-09-02-roscan2.mdx](../../content/blog/CAN/2024-09-02-roscan2.mdx) | 수정 | 큐·타임아웃 비교의 의미 중심으로 데모 소개 정리. |
| [WBC/2026-06-13-wbc01.mdx](../../content/blog/WBC/2026-06-13-wbc01.mdx) | 수정 | 토크 재구성 문단의 반복 도입어 정리. |
| [WBC/2026-06-14-wbc02.mdx](../../content/blog/WBC/2026-06-14-wbc02.mdx) | 유지 | 상태 계약·좌표계·캐시 소유권의 연결 확인. |
| [WBC/2026-06-15-wbc03.mdx](../../content/blog/WBC/2026-06-15-wbc03.mdx) | 유지 | 오차·속도·drift의 구분과 예제의 한계 확인. |
| [WBC/2026-06-16-wbc04.mdx](../../content/blog/WBC/2026-06-16-wbc04.mdx) | 유지 | NP와 Talos 비교의 범위, 가중치/우선순위 구분 확인. |
| [fingertip-design/en/2026-07-23-fingertip-design-01.md](../../content/blog/fingertip-design/en/2026-07-23-fingertip-design-01.md) | 수정 | 재료·형상·경계 조건의 역할 구분, rate/history 설명 수정. |
| [fingertip-design/en/2026-07-23-fingertip-design-02.md](../../content/blog/fingertip-design/en/2026-07-23-fingertip-design-02.md) | 수정 | 부착 경계 설명의 평가성 도입 삭제. |
| [fingertip-design/en/2026-07-23-fingertip-design-03.md](../../content/blog/fingertip-design/en/2026-07-23-fingertip-design-03.md) | 수정 | 관찰·구조 가설 구분, volumetric locking으로 연결 구체화. |
| [fingertip-design/en/2026-07-23-fingertip-design-04.md](../../content/blog/fingertip-design/en/2026-07-23-fingertip-design-04.md) | 수정 | 유한요소 선택을 수치 근사로 설명, 단조 하중의 검증 조건 명시. |
| [fingertip-design/en/2026-07-23-fingertip-design-05.md](../../content/blog/fingertip-design/en/2026-07-23-fingertip-design-05.md) | 수정 | 수렴 여부와 출력별 유효성 구분. |
| [fingertip-design/en/2026-07-23-fingertip-design-06.md](../../content/blog/fingertip-design/en/2026-07-23-fingertip-design-06.md) | 수정 | 축소 모델의 성공이 생략한 제약까지 검증하지 않음을 명시. |
| [fingertip-design/en/2026-07-23-fingertip-design-07.md](../../content/blog/fingertip-design/en/2026-07-23-fingertip-design-07.md) | 수정 | 동일 힘과 진폭 정규화 비교의 역할 분리, 사후 임계값 선택 설명 정리. |
| [fingertip-design/en/2026-07-23-fingertip-design-08.md](../../content/blog/fingertip-design/en/2026-07-23-fingertip-design-08.md) | 수정 | 양의 간극과 zero-clearance 접촉 활성화 실패 구분. |
| [fingertip-design/en/2026-07-23-fingertip-design-09.md](../../content/blog/fingertip-design/en/2026-07-23-fingertip-design-09.md) | 수정 | 프로파일·광학 입력 구분과 공분산 조건 명시. |
| [fingertip-design/en/2026-07-23-fingertip-design-10.md](../../content/blog/fingertip-design/en/2026-07-23-fingertip-design-10.md) | 수정 | 근거 없는 공차 예시 삭제, 공분산 조건과 남은 검증 명시. |
| [hardware/en/2025-12-01-hardware-01.mdx](../../content/blog/hardware/en/2025-12-01-hardware-01.mdx) | 수정 | Physical AI 수사와 반복 축소, 접촉 모델·결정론·STO 단정 조정. |
| [hardware/en/2025-12-02-hardware-02.mdx](../../content/blog/hardware/en/2025-12-02-hardware-02.mdx) | 수정 | 도입과 열 변화율을 예시로 표시, 점질량 계산 조건 명시. |
| [hardware/en/2025-12-03-hardware-03.mdx](../../content/blog/hardware/en/2025-12-03-hardware-03.mdx) | 수정 | 최적 감속비의 가정·효율 기반 관성 구분, 미확인 감속비 삭제. |
| [hardware/en/2025-12-04-hardware-03-01.md](../../content/blog/hardware/en/2025-12-04-hardware-03-01.md) | 유지 | 구조·오차·측정의 연결 확인. |
| [hardware/en/2025-12-04-hardware-03-02.md](../../content/blog/hardware/en/2025-12-04-hardware-03-02.md) | 수정 | 사용 범위와 역구동 비교의 근거 없는 최상급 축소. |
| [hardware/en/2025-12-05-hardware-03-03.md](../../content/blog/hardware/en/2025-12-05-hardware-03-03.md) | 유지 | 치형 수정·접촉 수·마찰 설명의 연결 확인. |
| [hardware/en/2025-12-06-hardware-04.mdx](../../content/blog/hardware/en/2025-12-06-hardware-04.mdx) | 수정 | 임피던스 경계·제어 효과·직구동 발열의 일반화 조정. |
| [hardware/en/2025-12-07-hardware-05.mdx](../../content/blog/hardware/en/2025-12-07-hardware-05.mdx) | 수정 | 데모의 가정과 감속비 환산 명시, 문단 분리. |
| [hardware/en/2025-12-09-hardware-06.mdx](../../content/blog/hardware/en/2025-12-09-hardware-06.mdx) | 수정 | 예시/실험·전압·디레이팅·QDD 오차·보호 조건 구분, 반복 결론 삭제. |
| [hardware/kr/2025-12-01-hardware-01-kr.mdx](../../content/blog/hardware/kr/2025-12-01-hardware-01-kr.mdx) | 수정 | Physical AI 수사와 반복 축소, 접촉 모델·결정론·STO 단정 조정. |
| [hardware/kr/2025-12-02-hardware-02-kr.mdx](../../content/blog/hardware/kr/2025-12-02-hardware-02-kr.mdx) | 수정 | 도입과 열 변화율을 예시로 표시, 점질량 계산 조건 명시. |
| [hardware/kr/2025-12-03-hardware-03-kr.mdx](../../content/blog/hardware/kr/2025-12-03-hardware-03-kr.mdx) | 수정 | 최적 감속비의 가정·효율 기반 관성 구분, 미확인 감속비 삭제. |
| [hardware/kr/2025-12-04-hardware-03-01-kr.md](../../content/blog/hardware/kr/2025-12-04-hardware-03-01-kr.md) | 유지 | 구조·오차·측정의 연결 확인. |
| [hardware/kr/2025-12-04-hardware-03-02-kr.md](../../content/blog/hardware/kr/2025-12-04-hardware-03-02-kr.md) | 수정 | 사용 범위와 역구동 비교의 근거 없는 최상급 축소. |
| [hardware/kr/2025-12-05-hardware-03-03-kr.md](../../content/blog/hardware/kr/2025-12-05-hardware-03-03-kr.md) | 유지 | 치형 수정·접촉 수·마찰 설명의 연결 확인. |
| [hardware/kr/2025-12-06-hardware-04-kr.mdx](../../content/blog/hardware/kr/2025-12-06-hardware-04-kr.mdx) | 수정 | 임피던스 경계·제어 효과·직구동 발열의 일반화 조정. |
| [hardware/kr/2025-12-07-hardware-05-kr.mdx](../../content/blog/hardware/kr/2025-12-07-hardware-05-kr.mdx) | 수정 | 데모의 가정과 감속비 환산 명시, 문단 분리. |
| [hardware/kr/2025-12-09-hardware-06-kr.mdx](../../content/blog/hardware/kr/2025-12-09-hardware-06-kr.mdx) | 수정 | 예시/실험·전압·디레이팅·QDD 오차·보호 조건 구분, 반복 결론 삭제. |
| [hardware/kr/2025-12-10-hardware-08-kr.md](../../content/blog/hardware/kr/2025-12-10-hardware-08-kr.md) | 수정 | 반복 결론 축소, Capler-Leg 순모멘트/합력 해석 구분과 인용 추가. |

## 확인이 남은 항목

- Fingertip Design의 `lit_ws` 결과는 이 저장소에서 실행 로그·소스 버전·전체 설정을 찾지 못했습니다. 반력·압력 roughness·프로파일 거리와 상태 라벨은 원고의 기록을 유지했고 재현 검증을 수행했다고 서술하지 않았습니다. 발행 전에 원본 결과와 수치 정의를 연결해야 합니다.
- Hardware 03의 Bilateral Drive Gear 감속비에는 기존부터 원문 확인 TODO가 있었습니다. 효율과 역구동 개시 토크를 설명하는 데 필요하지 않은 감속비를 본문에서 제거했습니다. 다른 시제품의 감속비를 대신 넣지 않았습니다.
- 미공개 케이블 초안의 `/assets/img/hardware/models/08-cable-force-routing.png` 파일은 없습니다. 좌우 배치 설명에 대응하는 도해가 발행 전에 필요합니다.
- 같은 초안의 Stanford CS235 Lecture 7은 기존 서지 정보를 유지했습니다. 강의 원본 링크와 인용 구간은 추가 확인이 필요합니다.
- 이미지 출처 링크가 곧 재사용 허락은 아닙니다. 이번 검토에서는 이미지 자산과 이용 조건을 새로 확보하거나 교체하지 않았습니다.

## 검증

- 전체 정적 빌드: 58개 페이지 생성 성공. 500 kB 초과 번들 경고가 있으며 이번 문장 편집에서 번들 구성은 변경하지 않았습니다.
- 43편 대조: 코드 블록, 표의 숫자, 이미지 경로, 제목·날짜·permalink·발행/숨김 상태·시리즈 정보 유지. 표시 수식은 케이블 초안의 결론에서 삭제한 두 블록을 제외하고 동일합니다.
- Hardware 06의 QDD 소제목을 바꾸면서 기존 한·영 앵커를 명시적으로 남겼습니다.
- 43편의 front matter 파싱과 `git diff --check`를 통과했습니다. 생성된 HTML에 KaTeX 오류 표기가 없고, Hardware 06의 기존 한·영 앵커가 남아 있음을 확인했습니다.
- 하드웨어 링크 검사: 미공개 케이블 초안의 누락 이미지와 자기 번역 URL 두 항목을 보고합니다. 둘 다 검토 시작본에도 존재합니다. 자기 번역 URL은 `published: false`여서 빌드 경로에 포함되지 않습니다.

이 기록은 편집 검토와 정적 빌드의 범위를 설명합니다. 시뮬레이션 재실행, 하드웨어 시험, 전 참고문헌 검증은 수행하지 않았습니다.
