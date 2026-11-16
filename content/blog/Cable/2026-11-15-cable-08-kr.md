---
title: "Cable 08 — MuJoCo tendon은 실제 케이블을 어디까지 표현할까?"
description: "Fixed·spatial tendon의 기하와 유효 물성 항을 구분하고, 분포 마찰과 시간 의존 거동을 옮길 때 남는 모델링 문제를 정리합니다."
published: false
date: 2026-11-15 00:00:00
permalink: /cable08-kr/
series: "Cable"
series_order: 8
series_label: "08"
lang: ko
tags: [Robotics, Cable, MuJoCo, Modeling]
---

*From System ID to MJCF — A Robot-Usable Tendon Abstraction*

<!-- Migration draft from Tendon-in-the-Loop; not a completed MJCF implementation tutorial. [P]: official-documentation facts or explicit derivations. [Q]: modeling/validation questions. -->

실험에서 케이블의 강성과 마찰을 식별했다고 합시다. 그 값을 MuJoCo의 tendon 설정에 넣으면 실제 전달계가 재현될까요? 먼저 어떤 좌표에 힘을 주는지, 측정한 강성이 무엇을 포함하는지, 구간별 장력 차이를 모델이 표현하는지 확인해야 합니다.

MuJoCo tendon은 로봇 자세에 따라 길이가 정해지는 scalar transmission coordinate입니다. 이 글은 그 기하와 유효 역학 항을 나누어 설명하고, 실제 케이블에서 남는 모델링 문제를 정리합니다. HIL 장치 자체의 설계와 motor-only neural observer는 [Tendon-in-the-Loop](/projects/tendon-in-the-loop/)에서 다룹니다.

*문서 기준: 2026-11-15 확인한 공식 stable 문서입니다. 이 저장소에는 실행 검증한 MuJoCo 모델이나 고정된 MuJoCo 의존성이 없으므로, 아래 설명을 특정 설치 버전에서 검증한 MJCF 예제로 제시하지 않습니다.*

## 1. Fixed tendon과 spatial tendon

[P] **Fixed tendon**은 관절 좌표의 선형 결합으로 길이를 정의합니다.

$$
\ell(\mathbf q)=\sum_i a_iq_i.
$$

일정한 모멘트 암을 갖는 이상적인 전달계를 표현할 때 유용합니다. 여기서 fixed는 길이를 계산하는 방식이며, 실제 케이블이 변형되지 않는다는 뜻은 아닙니다. [1](#ref-1)

**Spatial tendon**은 site와 wrapping obstacle을 지나는 기하 경로로 길이를 계산합니다. 자세에 따른 길이와 그 기울기는

$$
\ell=\ell(\mathbf q),
\qquad
\mathbf J_\ell(\mathbf q)=\frac{\partial\ell}{\partial\mathbf q}
$$

로 표현할 수 있습니다. 경로가 바뀌면 모멘트 암도 바뀔 수 있지만, 이 기하 계산이 실제 cable–surface contact의 국부 역학을 모두 푼다는 뜻은 아닙니다. [1](#ref-1)

또한 spatial tendon의 `pulley` 요소는 길이 계산의 분기와 divisor를 표현합니다. 자유 회전하는 sheave의 베어링과 마찰을 자동으로 만드는 요소로 읽으면 안 됩니다. [1](#ref-1)

## 2. 유효 역학 파라미터가 나타내는 것

[P] 공식 문서에서 제공하는 tendon 관련 항을 목적별로 나누면 다음과 같습니다. [1](#ref-1)

| 항목 | 표현하는 역할 | 해석할 때 주의할 점 |
|---|---|---|
| `springlength` | 스프링 기준 길이 또는 deadband | 설치된 전달계의 모든 slack·유격과 동일하지 않음 |
| `stiffness` | 선형 또는 다항식 탄성력 | 식별한 강성의 경계와 기준 상태를 맞춰야 함 |
| `damping` | 속도에 따른 감쇠력 | 모든 지연이나 hysteresis를 대신하지 않음 |
| `frictionloss` | 축약된 dry-friction constraint | 각 guide의 장력 분포를 푸는 모델이 아님 |
| `springyield` | 항복 후 스프링 기준 범위의 영구 이동 | 일반적인 creep·relaxation 모델과 구분 |
| `armature` | tendon 운동에 연관된 유효 관성 | 케이블의 분포 질량 모델과 구분 |
| `range`, `limited` | 길이 제한 | 기하 또는 기계적 제한을 지정 |

이 값들은 유용한 유효 표현입니다. 다만 실험에서 측정한 transmission stiffness에는 cable extension뿐 아니라 끝단과 구조물의 compliance도 들어갈 수 있습니다. 같은 이름의 파라미터를 옮기기 전에 무엇을 측정한 값인지 확인해야 합니다.

## 3. 경로를 그렸다고 마찰 분포가 생기지는 않는다

[P] Native `frictionloss`는 load-independent한 dry-friction 항입니다. 감김각과 장력에 따라 각 접촉점의 마찰을 계산하는 분포 케이블 모델과는 다릅니다. [2](#ref-2)

실제 케이블이 여러 풀리와 guide를 지나면 구간별 장력과 변형이 달라질 수 있습니다. 반면 하나의 native tendon 좌표는 각 구간에 독립적인 장력·변형 상태를 자동으로 제공하지 않습니다. [1](#ref-1)

[Q] 출력 장력 차이가 관심 대상이라면 별도의 상태나 구간 모델이 필요할 수 있습니다. 어느 정도로 나눌지는 센서가 구분할 수 있는 상태와 필요한 계산 비용에 맞춰 판단해야 합니다.

## 4. Hysteresis와 시간 의존 변화

[P] `springyield`는 항복에 따른 기준 길이 이동을 표현하는 이상적인 탄소성 모델입니다. [1](#ref-1) 이 기능이 있다는 사실만으로 creep, stress relaxation, bedding-in, 끝단 settling과 반복 마모가 모두 표현되는 것은 아닙니다.

[Q] 하중과 제하에서 다른 응답이 나오거나 반복 사용에 따라 기준 길이가 바뀐다면, 추가 내부 상태를 둘지 외부 force law를 사용할지 검토해야 합니다. 시뮬레이터에서 loop가 보인다는 것과 실험에서 관찰한 원인이 재현됐다는 것은 별개입니다.

## 5. 측정한 응답을 시뮬레이터에 옮기는 순서

먼저 경로와 모멘트 암을 확인하고, 관심 출력에 필요한 탄성·감쇠·마찰 항을 선택합니다. 그다음 측정과 같은 경계 조건에서 입력과 출력을 비교해야 합니다. 경로 설정을 확인하는 시험과 force law를 확인하는 시험을 구분하면 오차의 원인을 좁힐 수 있습니다.

[Q] 판단 기준은 native 항을 얼마나 많이 사용했는지가 아니라, 식별에 사용하지 않은 조건에서도 필요한 응답을 예측하는지입니다. Native tendon으로 충분한 범위와 추가 상태가 필요한 범위를 정한 뒤 구현을 선택해야 합니다.

## References

<a id="ref-1"></a>

[1] MuJoCo. [XML Reference — Tendon](https://mujoco.readthedocs.io/en/stable/XMLreference.html#tendon). Fixed·spatial tendon, wrapping, pulley 및 역학 항. 2026-11-15 확인.

<a id="ref-2"></a>

[2] MuJoCo. [Computation — Friction loss](https://mujoco.readthedocs.io/en/stable/computation/index.html#friction-loss). Dry-friction constraint의 정의. 2026-11-15 확인.

*초안 메모: 식별량–MJCF 매핑 표, 버전을 고정한 실행 예제와 검증은 Cable 08의 후속 작업입니다. [P]는 공식 문서 또는 명시한 가정하의 관계, [Q]는 검토할 질문을 표시합니다.*
