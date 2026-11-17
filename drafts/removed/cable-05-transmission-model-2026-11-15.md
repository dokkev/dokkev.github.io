---
title: "Cable 05 — 케이블 역학에서 전달계 모델로"
description: "경로 기하와 실제 힘·변위 전달을 구분하고, 마찰·탄성·하중 이력을 어느 수준까지 모델에 포함해야 하는지 살펴봅니다."
published: false
date: 2026-11-15 00:00:00
permalink: /cable05-kr/
series: "Cable"
series_order: 5
series_label: "05"
lang: ko
tags: [Robotics, Cable, Tendon-driven Robots, Modeling]
---

*From Cable Mechanics to Transmission Models — How Much Physics Is Enough?*

<!-- Migration draft from Tendon-in-the-Loop. Scope follows Cable 05; the planned literature comparison remains to be developed. [P]: cited relations or explicit model assumptions. [Q]: open modeling questions. [I]: proposed model forms. -->

케이블이 어느 경로를 지나는지 알면 길이와 모멘트 암을 계산할 수 있습니다. 하지만 그 계산만으로 모터 쪽 장력과 변위가 출력에 어떻게 전달되는지까지 정해지지는 않습니다. 경로를 따라 마찰이 생기고, 케이블과 끝단이 변형되며, 같은 입력에도 하중 이력에 따라 다른 응답이 나올 수 있기 때문입니다.

그렇다고 모든 섬유와 접촉을 모델링해야 하는 것은 아닙니다. 필요한 것은 출력 장력인지, 관절 위치인지, 접촉력인지부터 정해야 합니다. 같은 케이블이라도 무엇을 예측하려는지에 따라 필요한 모델의 경계와 내부 상태가 달라집니다.

이 글은 Tendon-in-the-Loop 프로젝트에서 일반적인 전달계 모델링 설명을 분리한 초안입니다. HIL 장치와 neural observer의 설계는 [프로젝트 페이지](/projects/tendon-in-the-loop/)에서 다룹니다.

## 1. 모델의 경계부터 정하기

[I] 설치된 전달계의 출력 장력을 예측한다면, 다음과 같은 형태에서 출발할 수 있습니다.

$$
\hat T_{\mathrm{out}} = f\left(
x_{\mathrm{in}},x_{\mathrm{out}},
\dot x_{\mathrm{in}},\dot x_{\mathrm{out}},
\mathbf g(\mathbf q),\mathbf z;\boldsymbol\theta
\right).
$$

$x_{\mathrm{in}},x_{\mathrm{out}}$은 측정 경계의 변위, $\mathbf g$는 routing geometry, $\mathbf z$는 하중 이력에 따른 내부 상태입니다. $\boldsymbol\theta$는 식별할 유효 파라미터입니다. 특정 구성 법칙을 제시한 식은 아니며, 모든 전달계가 이 변수들을 전부 필요로 한다는 뜻도 아닙니다.

케이블 시편만 경계에 넣는 경우와 끝단·풀리·구조물을 함께 넣는 경우에는 같은 이름의 강성도 다른 양을 나타낼 수 있습니다. 측정한 변위를 무엇으로 나누고 어떤 기준 상태에서 계산했는지 정의해야 모델 파라미터를 비교할 수 있습니다.

## 2. 경로 기하와 힘 전달을 구분하기

[P] Tendon 길이를 $\ell(\mathbf q)$라 하고 $T>0$를 인장 장력으로 두면, 케이블이 길어지는 방향에 저항하는 관절 토크는

$$
\boldsymbol\tau_t=-\mathbf J_\ell(\mathbf q)^T T,
\qquad
\mathbf J_\ell(\mathbf q)=\frac{\partial\ell}{\partial\mathbf q}
$$

로 표현할 수 있습니다. 이 관계는 경로가 주어졌을 때 장력을 관절 토크로 바꿉니다. 입력과 출력의 장력이 같은지, 모터 이동량 중 얼마가 케이블 신장인지까지 결정하지는 않습니다.

일정한 모멘트 암을 갖는 팽팽한 케이블의 선형 탄성 근사에서는, pretension 상태로부터의 이동량을

$$
x_m=rq+\delta_e+\delta_c,
\qquad
\delta_e=\frac{T-T_0}{k}
$$

처럼 나눌 수 있습니다. 여기서 $k$는 해당 길이와 시험 조건에서의 전달계 강성, $\delta_c$는 탄성 모델에 포함하지 않은 길이 변화입니다. 실제 측정에서 이 잔차를 모두 재료의 creep으로 해석해서는 안 됩니다. 끝단 이동이나 구조물 변형도 포함될 수 있습니다.

## 3. 경로에 따라 달라지는 마찰

[P] 이상적인 capstan 조건에서 미끄러지기 직전의 장력비는

$$
\frac{T_{\mathrm{high}}}{T_{\mathrm{low}}}=e^{\mu\phi}
$$

입니다. $\mu$는 마찰계수, $\phi$는 감김각입니다. 이 한계 관계는 케이블과 접촉면 사이의 미끄럼을 다루며, 자유 회전 풀리의 베어링 손실 전체를 같은 식으로 나타낸 것은 아닙니다.

여러 guide나 pulley를 지나는 케이블은 구간마다 다른 장력을 가질 수 있습니다. 관절 자세가 바뀌면 감김각과 접촉 조건도 달라질 수 있으므로, 장력 전달을 하나의 고정 효율로 묶는 근사가 어느 범위에서 유효한지 확인해야 합니다.

상세한 분포 모델은 구간별 마찰과 변형을 표현할 수 있지만, 추가 파라미터와 측정도 요구합니다. 단일 유효 강성이나 마찰 항으로 충분한지 판단하려면 목표 출력과 검증 조건을 먼저 정해야 합니다. MuJoCo의 경로·마찰 표현은 Cable 08 초안에서 따로 다룹니다.

## 4. 하중 이력이 필요한 경우

[Q] 하중을 올릴 때와 내릴 때, 방향을 바꿀 때 응답이 다르다면 현재 변위와 속도만으로 충분한지부터 물어야 합니다. 내부 마찰, 국부 미끄럼, 접촉 재배열 등의 효과를 구분하려면 그 원인을 분리할 수 있는 실험이 필요합니다. 하나의 hysteresis loop만으로 특정 메커니즘이 확인되는 것은 아닙니다.

시간에 따른 변화도 구분해야 합니다. Creep, stress relaxation, bedding-in, 끝단의 settling이나 slip, 반복 굽힘에 따른 마모는 같은 현상이 아닙니다. 영구 변형을 표현하는 모델 하나가 이 거동을 모두 대신하지는 않습니다.

[I] 현재 입력만으로 설명되지 않는 응답이 남으면 내부 상태를 추가하거나, 최근 측정 이력을 쓰는 잔차 모델을 고려할 수 있습니다.

$$
\hat T_{\mathrm{out}}
=T_{\mathrm{physics}}(\mathbf x;\boldsymbol\theta)
+\Delta T_{\mathrm{learned}}(\mathbf x_{t-H:t}).
$$

어느 표현이 유용한지는 학습한 궤적의 적합도보다, 제외해 둔 하중·속도·routing·운용 이력에서의 예측으로 판단해야 합니다.

## 5. 토크 제어에도 관절 기하가 필요한 이유

[P] 2 DoF 손가락의 끝점 힘을 제어할 때는 끝점 Jacobian이 필요합니다. 추정 자세 $\hat{\mathbf q}$를 사용하는 제어기는 이상적으로

$$
\boldsymbol\tau_{\mathrm{des}}
=\mathbf J(\hat{\mathbf q})^T\mathbf F_{\mathrm{target}}
$$

를 계산합니다. 실제 기하에서는 $\boldsymbol\tau=\mathbf J(\mathbf q)^T\mathbf F_{\mathrm{actual}}$가 성립하므로, 계산한 토크를 정확히 전달해도 자세 추정이 틀리면 원하는 끝점 힘이 나오지 않을 수 있습니다. 이 식의 $\mathbf J$는 끝점 Jacobian이며 앞의 tendon 길이 Jacobian $\mathbf J_\ell$과 구분해야 합니다. [1](#ref-1)

[2 DoF cyclic creep 데모](/cable-demos/#creep-demo)는 Ground Truth, Motor Encoder Only, 탄성 신장 모델을 적용한 추정 자세를 함께 보여줍니다. 탄성 신장을 빼도 남는 길이 변화가 자세 추정과 힘 제어에 어떤 영향을 주는지 비교하는 교육용 모델입니다. 실제 소재 측정값이나 HIL 결과는 아닙니다.

이 데모에서 tendon은 당기는 방향으로만 힘을 냅니다. 또한 두 번째 tendon이 두 관절을 지나므로, 원하는 관절 토크를 tendon 장력으로 바꾸는 전달 행렬과 그 제한도 필요합니다. 자세 오차와 장력 제한은 서로 다른 오차 원인입니다.

## 6. 좋은 전달계 모델의 기준

기하 모델은 장력과 관절 토크를 연결하고, 전달계 모델은 입력과 출력 사이의 변형과 손실을 연결합니다. 어느 쪽을 자세히 만들어도 측정하지 않은 상태가 자동으로 관측 가능해지는 것은 아닙니다.

[Q] 모델 선택의 질문은 어떤 메커니즘을 가장 많이 넣었는지가 아니라, 정해진 운용 범위에서 필요한 출력을 예측할 수 있는지입니다. 다음 단계는 사용할 센서와 입력으로 어떤 파라미터와 내부 상태를 구별할 수 있는지 확인하는 것입니다. 이 식별 문제는 Cable 06의 범위입니다.

## References

<a id="ref-1"></a>

[1] K. M. Lynch, F. C. Park. *Modern Robotics*, Chapter 11.5, “Force Control.” [저자 제공 강의](https://modernrobotics.northwestern.edu/nu-gm-book-resource/11-5-force-control/). 끝점 힘과 관절 토크의 Jacobian 전치 관계.

*초안 메모: 마찰·점탄성 모델별 문헌 비교와 식별 조건은 시리즈 개요의 Cable 05 범위에 맞춰 보완할 예정입니다. [P]는 인용 또는 명시한 가정하의 관계, [I]는 모델 제안, [Q]는 검토할 질문을 표시합니다.*
