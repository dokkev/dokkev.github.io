# Cable 06 재료: CBOS testbed

출처: `content/blog/Cable/2026-11-15-cable-01-kr.md` (Cable 01 초안). 2026-11-16 Cable 시리즈를 5편으로 재구성하면서 01에서 떼어 냄. 아래는 원문 그대로이며, 참고문헌 번호는 01 초안의 번호입니다.

<!-- 01 초안 264-297행 -->

## 8. CBOS testbed는 원인을 구분할 수 있어야 한다

이 관점을 CBOS tendon fatigue testbed 설계에 적용해 보겠습니다. CBOS는 반복 굽힘 하중 조건을 가리키며, testbed는 그 조건을 구현하고 측정하는 장치입니다. 아래에서는 2025년 설계 과정의 관찰과 앞으로 검증할 질문을 구분해 다루겠습니다.

CBOS에서는 장력을 받은 케이블 구간이 sheave 위를 왕복하며 반복 굽힘을 겪도록 합니다. 그런데 같은 왕복 횟수라도 stroke와 routing에 따라 어느 구간이 몇 번 굽혀지는지가 달라집니다. 한 왕복을 한 cycle로 셌는지, 한 번의 굽힘 통과를 셌는지도 명시해야 합니다.

Davies 등은 braided HMPE 로프의 CBOS에서 파단까지의 시험과, 중간에 멈춘 뒤 잔존 강도를 측정하는 시험을 함께 수행했습니다. 이 논문의 수명 모델은 해당 로프와 시험 조건에서 식별한 경험 모델입니다. 소형 로봇 tendon에 계수를 옮기기보다, 파단 횟수 외에 손상 진행을 관찰하는 시험 논리를 참고할 수 있습니다. [6](#ref-6)

지금 참고한 CBOS 문헌에는 해양 handling용 대형 로프를 대상으로 한 연구가 있습니다. 이런 연구에서 로봇 tendon으로 넘어올 때에는 시험의 크기와 하중뿐 아니라, 우리가 예측하려는 출력도 다시 정해야 합니다. 이 시리즈에서는 수명 평가에 더해 **파단에 이르기 전 transmission의 힘·운동 전달을 얼마나 예측할 수 있는지** 묻고자 합니다. 기존 연구가 수명만 다뤘다는 뜻은 아닙니다. 앞서 살펴본 강성·이력·마찰 연구를 로봇 전달계의 입출력 예측이라는 질문으로 연결하려는 것입니다.

예를 들어 입력 변위와 장력을 알 때 출력 변위와 장력을 예측할 수 있는지, 반복 작동 후에도 같은 모델이 유효한지 확인하고 싶습니다. 측정한 한 궤적에 모델을 맞추는 것과, 보지 않은 하중·속도·작동 이력에서 응답을 예측하는 것은 구분해야 합니다. 어떤 출력에 대해, 어느 시간 범위와 작동 조건에서, 어느 정도의 오차를 허용할지도 함께 정해야 합니다. 이는 앞으로의 시험에서 검증할 질문입니다.

설계 단계에서는 다음처럼 관측과 질문을 연결할 수 있습니다.

| 관측·기록할 양 | 구분하려는 문제 |
| --- | --- |
| 시험 구간의 실제 장력과 시간 이력 | 늘어남에 따라 굽힘 하중도 달라졌는가? |
| 케이블 gauge 구간의 길이와 끝단 마커 위치 | 본체의 변형인가, 고정부의 이동인가? |
| 필요 시 sheave 양측 장력과 회전 상태 | 접촉 손실·베어링 저항·미끄럼을 어떻게 구분할 것인가? |
| $D/d$, groove, 정렬, stroke와 손상 위치 | 의도한 반복 굽힘인가, 가장자리 접촉이나 다른 국부 하중인가? |
| 속도·주파수·휴지 시간·온도·환경 | 같은 횟수를 같은 열적·시간적 조건에서 비교했는가? |
| 사전 conditioning, 파단 위치와 잔존 강도 | 초기 자리잡음, 끝단 파손, 본체 손상을 구분할 수 있는가? |

특히 dead weight로 하중을 줬다는 사실만으로 시험 구간의 장력이 항상 일정하다고 가정해서는 안 됩니다. 가속도와 경로 손실이 있으면 실제 장력을 확인해야 합니다. 반대로 양끝 거리를 고정하는 방식에서는 길이와 내부 상태의 변화가 장력 변화로 나타날 수 있습니다. 어떤 경계 조건을 택했는지에 따라 시험이 답하는 질문도 달라집니다.

2025년 7월 28일에 논의한 시험에서는 position control로 반복 운동을 주었지만, 케이블마다 탄성과 영구적인 길이 변화가 달라 load spring의 압축량도 변했습니다. 따라서 같은 위치 명령을 주더라도 케이블이 경험하는 장력 이력이 같다고 볼 수 없었습니다 [12](#ref-12). **A controlled motion is not necessarily a controlled loading condition.** 케이블의 미지 특성이 측정 대상의 응답뿐 아니라 시험장치가 가하는 하중까지 바꿀 수 있다는 사례입니다.

소재별 fatigue life를 비교하려면 같은 stroke와 cycle 수를 맞추는 것에 더해 실제 장력 이력을 확인해야 합니다. 장력 이력이 달랐다면 관측한 수명 차이를 소재의 내구 차이만으로 설명하기 어렵습니다. 일정한 하중의 비교가 목표인지, 위치 제어 시스템에서 하중이 변하는 과정까지 평가하려는지 먼저 정해야 합니다.

당시에는 input/output pulley position과 tension을 기록하고, 사이클별 hysteresis와 입출력 장력의 주파수 응답, 위상·harmonic 변화를 분석하는 방안도 검토했습니다 [12](#ref-12). 이는 마모 지표로 검증된 결과가 아니라 후속 분석 가설입니다. 파단 전에 transmission 응답이 어떻게 변하는지 측정한다는 방향으로, Cable 06 이후의 system identification과 degradation monitoring에 연결하겠습니다.

제안하는 출발점은 시험을 단계적으로 연결하는 것입니다. 먼저 직선 시편에서 loading–unloading과 hold를 측정해 인장 응답·시간 의존성의 기준을 잡습니다. 다음에는 실제 termination을 붙여 본체 변형과 끝단 이동을 나누어 봅니다. 그다음 CBOS 조건에서 응답과 손상 위치가 어떻게 달라지는지 비교합니다. 단계 사이의 사전 이력을 맞추고 반복 시편을 두어야, 시험 순서와 시편 편차를 조건 효과로 오인할 가능성도 줄일 수 있습니다.

이 구성이 모든 메커니즘을 독립적으로 식별해 주지는 않습니다. 다만 모터 encoder와 파단 횟수만 볼 때보다 원인을 좁힐 수 있습니다. 장력이 줄었다는 관찰에서 곧바로 creep를 주장하거나, 표면에 보풀이 생겼다는 관찰에서 잔여 수명을 계산하지 않도록 도와줍니다.

<!-- 01 초안 299-315행 -->

## 9. 다음 모델에는 무엇을 남겨야 할까

처음의 선형 인장 모델을 버릴 필요는 없습니다. 일정한 경로와 온도, 충분히 정의된 conditioning, 제한된 장력·속도 범위에서는 유효 강성 하나가 목적에 맞는 근사일 수 있습니다. 필요한 것은 복잡성을 모두 넣는 일이 아니라, 그 근사가 유지되는 범위를 확인하는 일입니다.

그 범위를 벗어나면 모델의 질문이 달라집니다. 현재 장력과 길이만으로 다음 응답을 예측할 수 있는가? 과거의 하중, 내부 접촉 상태, 끝단 이동이나 손상 상태 중 무엇을 더 알아야 하는가? 그리고 그 상태를 지금의 센서로 구분할 수 있는가?

Cable 02에서는 tendon/cable-driven system이 로봇에 어떻게 쓰이는지 살펴보겠습니다. 구동기를 어디에 두고, 케이블을 어떤 경로로 보내며, 관절에 힘과 운동을 어떻게 전달하는지 실제 로봇 사례와 연결하려 합니다.

Cable 03에서는 termination을 다룹니다. Cable 04에서는 yarn-to-yarn abrasion과 cable construction을 연결해, 내부 접촉과 구조가 케이블 거동에 어떻게 관여하는지 살펴보겠습니다.

Cable 05에서는 로봇용 cable/tendon transmission modeling의 최신 논문을 살펴보겠습니다. 각 모델이 어떤 물리 현상을 포함하고, 무엇을 측정·식별하며, 어떤 조건에서 힘과 운동 전달을 예측하는지 비교하려 합니다.

MuJoCo의 tendon 표현과 XML 구현은 Cable 08에서 따로 다루려 합니다. 경로와 물성을 어떻게 표현하는지 확인하고, 그 설정이 실제 케이블 거동을 어디까지 담는지 문헌과 연결해 살펴보겠습니다.

Cable 06 이후에는 observability, system identification, testbed design을 다루고, Real2Sim2Real과 adaptive control로 확장할 예정입니다. 이후 주제의 순서와 범위는 문제를 더 모은 뒤 정하겠습니다.

그 출발점은 케이블을 고를 때 질문을 하나 더 붙이는 것입니다. “얼마나 큰 힘을 버티는가?”와 함께, **“어떤 경로와 고정 방식, 어떤 하중 이력에서 힘과 운동을 어떻게 전달하는가?”**를 묻는 것입니다.

## References

<a id="ref-1"></a>

[1] G. Palli, G. Borghesan, C. Melchiorri. “Modeling, Identification, and Control of Tendon-Based Actuation Systems.” *IEEE Transactions on Robotics*, 28(2), 277–290, 2012. [DOI: 10.1109/TRO.2011.2171610](https://doi.org/10.1109/TRO.2011.2171610). 곡선 고정 경로의 마찰과 polymer tendon의 점탄성 모델 및 실험.

<a id="ref-2"></a>

[2] A. Horigome, G. Endo. “Basic study for drive mechanism with synthetic fiber rope – investigation of strength reduction by bending and terminal fixation method.” *Advanced Robotics*, 30(3), 206–217, 2016. [DOI: 10.1080/01691864.2015.1102649](https://doi.org/10.1080/01691864.2015.1102649). 굽힘 비율과 끝단 고정 방식에 따른 정적 강도 시험.

<a id="ref-3"></a>

[3] Y. Lian, H. Liu, L. Li, Y. Zhang. “An experimental investigation on the bedding-in behavior of synthetic fiber ropes.” *Ocean Engineering*, 160, 368–381, 2018. [DOI: 10.1016/j.oceaneng.2018.04.071](https://doi.org/10.1016/j.oceaneng.2018.04.071). 사전 반복 하중과 bedding-in 정도에 관한 실험.

<a id="ref-4"></a>

[4] P. Davies, Y. Reaud, L. Dussud, P. Woerther. “Mechanical behaviour of HMPE and aramid fibre ropes for deep sea handling operations.” *Ocean Engineering*, 38(17–18), 2208–2214, 2011. [DOI: 10.1016/j.oceaneng.2011.10.010](https://doi.org/10.1016/j.oceaneng.2011.10.010). 섬유와 완성 로프의 응답, 하중 이력에 따른 강성 변화. [저자 공개 원고](https://archimer.ifremer.fr/doc/00054/16573/14068.pdf).

<a id="ref-5"></a>

[5] G. Endo, A. Horigome, Y. Wakabayashi, A. Takata. “Basic study for drive mechanism with synthetic fiber rope (Terminal fixation method using a grooved pulley and a figure-eight knot).” *Transactions of the JSME (in Japanese)*, 84(864), 18-00067, 2018. [DOI: 10.1299/transjsme.18-00067](https://doi.org/10.1299/transjsme.18-00067). 권선 마찰과 매듭을 함께 사용하는 끝단 고정 설계. [공개 논문 페이지](https://www.jstage.jst.go.jp/article/transjsme/84/864/84_18-00067/_article/-char/en).

<a id="ref-6"></a>

[6] P. Davies, M. François, N. Lacotte, T. D. Vu, D. Durville. “An empirical model to predict the lifetime of braided HMPE handling ropes under cyclic bend over sheave (CBOS) loading.” *Ocean Engineering*, 97, 74–81, 2015. [DOI: 10.1016/j.oceaneng.2015.01.003](https://doi.org/10.1016/j.oceaneng.2015.01.003). CBOS 파단 시험·잔존 강도와 경험적 수명 모델. [저자 공개 원고](https://archimer.ifremer.fr/doc/00251/36215/34775.pdf).

<a id="ref-7"></a>

[7] C. M. Leech. “The modelling of friction in polymer fibre ropes.” *International Journal of Mechanical Sciences*, 44(3), 621–643, 2002. [DOI: 10.1016/S0020-7403(01)00095-9](https://doi.org/10.1016/S0020-7403(01)00095-9). 계층 구조와 구성 요소 사이의 상대 이동·마찰 모델.

<a id="ref-10"></a>

[10] V. Agrawal, W. J. Peine, B. Yao. “Modeling of Transmission Characteristics Across a Cable-Conduit System.” *IEEE Transactions on Robotics*, 26(5), 914–924, 2010. [DOI: 10.1109/TRO.2010.2064014](https://doi.org/10.1109/TRO.2010.2064014). [저자 공개 원고](https://engineering.purdue.edu/~byao/Papers/TRO_Modeling_2010.pdf). Cable–conduit의 마찰·탄성과 장력 전달을 다루는 문헌.

<a id="ref-12"></a>

[12] 사용자 제공 연구 이력. “2025년 6–8월 CBOS testbed 설계·관찰 및 분석 아이디어 회고.” 본 대화에서 2026-11-15 제공. 비공개 개인 연구 맥락이며 출판 논문이 아니다. 원본 대화·실험 로그의 독립 검증은 수행하지 않았다. 날짜별 시험 조건·관찰과 당시 분석 가설을 구분해 인용한다. DOI·공개 링크 없음.

해양 로프 연구의 시험 크기·하중·환경은 소형 로봇 tendon과 다릅니다. 이 글에서는 해당 연구의 메커니즘과 검증 관점을 참고했으며, 수명 계수나 소재 순위를 로봇 케이블에 그대로 적용하지 않았습니다.

<span id="ref-13"></span>

[13] C. C. Christoph, M. Eberlein, F. Katsimalis, A. Roberti, A. Sympetheros, M. R. Vogt, D. Liconti, C. Yang, B. G. Cangan, R. J. Hinchet, and R. K. Katzschmann, “ORCA: An Open-Source, Reliable, Cost-Effective, Anthropomorphic Robotic Hand for Uninterrupted Dexterous Task Learning,” accepted to *IEEE/RSJ International Conference on Intelligent Robots and Systems (IROS)*, 2025. arXiv:2504.04259. [Paper](https://arxiv.org/abs/2504.04259) · [Project](https://srl.ethz.ch/orcahand)

<span id="ref-14"></span>

[14] LIROS, “Dyneema DM20 Creepless Rope,” product photo, Pirates Cave. [Link](https://www.piratescave.co.uk/dyneema-dm20-creepless-rope)

<span id="ref-15"></span>

[15] Justsail, “LIROS Dyneema SK78 hollowbraid line” (File:LIROS_Dyneema_hollow.jpg), Wikimedia Commons, CC BY-SA 3.0. [Link](https://commons.wikimedia.org/wiki/File:LIROS_Dyneema_hollow.jpg)

<span id="ref-16"></span>

[16] Kuraray Co., Ltd., “Vectran™,” product page. [Link](https://www.kuraray.com/products/vectran)

<span id="ref-17"></span>

[17] Cjp24, “Aramid fiber” (File:Aramid_fiber.jpg), Wikimedia Commons, CC BY-SA 3.0. [Link](https://commons.wikimedia.org/wiki/File:Aramid_fiber.jpg)

<span id="ref-18"></span>

[18] Teijin Aramid, “Technora®,” product page. [Link](https://www.teijinaramid.com/en/products/technora/)

<span id="ref-19"></span>

[19] Avient Corporation, “Zylon® PBO Fiber,” product page. [Link](https://www.avient.com/node/19725)
