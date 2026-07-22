# 로봇 하드웨어 포스트 템플릿 (KR)

이 파일은 새 포스트의 출발점입니다. 대괄호로 표시된 내용과 HTML 주석은 작성하면서 삭제합니다. 글의 논리에 맞지 않는 절은 생략하거나 순서를 바꿔도 됩니다.

```markdown
---
title: "[로봇 하드웨어 NN] - [현상 또는 핵심 질문이 드러나는 제목]"
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
이 글은 [현상]이 [물리적 원인] 때문에 생기고, 그 결과 [설계·제어·실험의 무엇]이 달라지는지를 설명합니다.

독자가 기억할 한 문장:
[결론을 먼저 적어둡니다.]
-->

[현장에서 관찰되는 모순, 실패 또는 질문으로 시작합니다.]

[2~4개 문단 안에 통념이 왜 불충분한지 설명하고, 이 글의 핵심 주장을 제시합니다.]

## [현상이 드러나는 제목]

[무엇이 실제로 관찰되는지 설명합니다. 용어 정의부터 시작하지 않습니다.]

## [물리적 메커니즘이 드러나는 제목]

[지배적인 구조와 물리량을 설명합니다. 필요하다면 수식 또는 그림을 사용합니다.]

$$
[핵심 관계식]
$$

[기호와 가정을 정의하고, 이 관계가 실제 로봇 출력에서 무엇을 바꾸는지 해석합니다.]

<!-- 선택: 그림이 설명을 실제로 개선할 때만 사용합니다. -->
<div class="row mt-3">
    <div class="col-sm mt-3 mt-md-0 text-center">
        {% include figure.liquid loading="eager" path="assets/img/[경로]" class="img-fluid rounded z-depth-1" %}
        <div class="caption">
            [그림에서 독자가 읽어야 할 핵심과 출처]
        </div>
    </div>
</div>

## [조건 또는 trade-off가 드러나는 제목]

[정적/동적, 입력/출력, 저속/고속 등 혼동하기 쉬운 조건을 구분합니다.]

[한 설계 선택이 무엇을 개선하는 동시에 무엇을 악화시키는지 설명합니다.]

## [설계·제어 관점의 의미]

[센서, 기구, 저수준 제어 또는 상위 알고리즘 가운데 어느 계층에서 대응해야 하는지 설명합니다.]

[AI 기반 접근법과 연결할 필요가 있다면, 먼저 action–output 관계나 데이터 재사용성을 바꾸는 구체적인 하드웨어 원인을 제시합니다.]

## 결론

[중심 질문에 직접 답합니다. 어떤 조건에서 무엇을 얻고 무엇을 포기하는지 한두 문단으로 정리합니다.]

[다음 포스트: [제목]](/permalink/)

## References

[1] [저자/기관], "[제목]," [학회·저널·공식 문서], [연도]. [링크]
```

초안을 완성한 뒤에는 [`guideline.md`](./guideline.md)의 발행 전 체크리스트를 사용합니다.
