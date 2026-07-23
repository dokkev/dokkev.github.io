# 로봇 하드웨어 포스트 템플릿 (KR)

이 파일은 새 포스트의 front matter와 작성 전 메모를 위한 느슨한 출발점입니다. 아래 질문은 방향을 잡기 위한 것이며, 답을 전부 본문에 넣거나 같은 목차를 사용할 필요는 없습니다. 글의 구조는 주제에 가장 자연스러운 방식으로 정합니다.

```markdown
---
title: "[로봇 하드웨어 NN] - [소주제 (NN)] : [짧은 제목]"
description: [부품명 나열보다 이 글이 설명하는 물리적 문제를 한 문장으로 작성]
layout: distill
published: false
hidden: true
date: YYYY-MM-DD 00:00:00
img: /assets/img/[대표 이미지 경로]
permalink: /hardwareNN-kr/
series: "[EN/KR] Robot Hardware"
series_order: NN
series_label: "NN"
lang: ko
translations:
  - lang: en
    label: EN
    url: /hardwareNN/
  - lang: ko
    label: KR
    url: /hardwareNN-kr/
tags: [Hardware Development]
---

[Physical AI 관점에서 본 다관절 로봇 하드웨어 시리즈](/projects/hardware-kr/)

<!--
중심 질문:
[이 글에서 끝까지 답하려는 질문 하나]

독자가 기억할 한 문장:
[결론을 먼저 적어둡니다.]

생각해볼 질문 — 주제와 관련된 것만 사용:
- 제어기, policy 또는 시뮬레이터는 무엇을 이상화하고 있나?
- 이 현상과 직접 관련된 명령 또는 관측 경로는 어디까지인가?
- 어느 물리량이 상태, 시간 또는 운전 조건에 따라 달라지나?
- 실제 실험에서는 어떤 failure signature로 보이나?
- 이 현상이 다른 계층의 설계나 제어 판단을 어떻게 바꾸나?
-->

[현장에서 관찰되는 모순, 실패 또는 질문으로 시작합니다.]

[2~4개 문단 안에 통념이 왜 불충분한지 설명하고, 이 글의 핵심 주장을 제시합니다.]

<!--
아래는 사용할 수 있는 절의 예시입니다. 그대로 사용하지 않아도 됩니다.

- 관찰되는 현상 또는 문제
- 필요한 구조와 작동 원리
- 지배적인 물리 메커니즘
- 이상 모델이 생략한 항
- 운전 조건에 따른 trade-off
- 시스템 수준의 실패 양상
- 설계·센싱·제어 관점의 의미
-->

## [주제에 맞는 제목]

[자유로운 구조로 본문을 작성합니다.]

<!-- 선택: 인과관계를 압축하는 데 수식이 유용할 때만 사용합니다. -->

$$
[핵심 관계식]
$$

[기호와 가정을 정의하고, 이상식에서 생략된 항을 밝힙니다. 이 관계가 실제 로봇 출력에서 무엇을 바꾸는지도 해석합니다.]

<!-- 선택: 그림이 설명을 실제로 개선할 때만 사용합니다. -->
<div class="row mt-3">
    <div class="col-sm mt-3 mt-md-0 text-center">
        {% include figure.liquid loading="eager" path="assets/img/[경로]" class="img-fluid rounded z-depth-1" %}
        <div class="caption">
            [그림에서 독자가 읽어야 할 핵심과 출처]
        </div>
    </div>
</div>

[필요하다면 주제에 맞는 추가 절과 결론을 작성합니다. 고정된 목차는 없습니다.]

[다음 포스트: [제목]](/permalink/)

## References

[1] [저자/기관], "[제목]," [학회·저널·공식 문서], [연도]. [링크]
```

초안을 완성한 뒤에는 [`guideline.md`](./guideline.md)의 점검 질문을 참고합니다.
