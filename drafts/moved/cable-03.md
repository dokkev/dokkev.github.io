# Cable 03 재료: 케이블 구조, 굽힘, 시간 의존 거동

출처: `content/blog/Cable/2026-11-15-cable-01-kr.md` (Cable 01 초안). 2026-11-16 Cable 시리즈를 5편으로 재구성하면서 01에서 떼어 냄. 아래는 원문 그대로이며, 참고문헌 번호는 01 초안의 번호입니다.

<!-- 01 초안 130-142행 -->

## 3. 경로를 휘게 만드는 순간, 축 방향 인장만 남지 않는다

굽힘을 이해하는 가장 간단한 출발점은 보 이론입니다. 중립축에서 거리 $y$만큼 떨어진 위치의 굽힘 변형률은, 곡률 $\kappa$에 대해

$$
\varepsilon_b(y)\simeq\kappa y,\qquad \kappa=\frac{1}{R}
$$

입니다. 균질한 원형 부재의 지름을 $d$라고 하면 바깥쪽 변형률의 크기는 대략 $d/(2R)$입니다. 작은 반경으로 구부릴수록 단면 안의 변형률 차이가 커진다는 직관을 줍니다.

하지만 편조 케이블 전체를 이 균질 보로 계산해 섬유의 피로 수명을 예측할 수는 없습니다. 내부 yarn은 서로 다른 경로를 지나고, 단면은 눌리며, 접촉부에서 상대 이동이 생길 수 있습니다. 굽힘을 수용하는 방식 자체가 construction에 달려 있습니다.

그래서 풀리 또는 sheave의 기준 직경 $D$와 케이블 직경 $d$의 비율인 $D/d$를 살펴봅니다. 이 값은 굽힘의 기하학적 조건을 비교하는 출발점이지만, groove 형상·장력·재료·construction까지 대표하는 수명 변수는 아닙니다. 비교할 때에는 $D$가 groove 바닥 직경인지 케이블 중심선 기준 직경인지도 통일해야 합니다. Horigome와 Endo는 로봇 구동용 합성섬유 로프에서 굽힘 비율에 따른 정적 인장 강도 감소를 실험했습니다. **정적 굽힘 강도와 반복 굽힘 수명은 별도로 확인할 양**입니다. [2](#ref-2)

<!-- 01 초안 156-209행 -->

## 4. 늘어났다는 관찰만으로 원인을 알 수는 없다

케이블을 당겼다 놓았는데 처음 길이로 돌아오지 않았다고 합시다. 이 관찰만으로 creep가 생겼다고 결론 내릴 수 있을까요? 아직은 어렵습니다. 섬유의 시간 의존 변형일 수도 있고, braid가 자리잡았거나 끝단이 이동했을 수도 있습니다.

| 현상 | 구분에 도움이 되는 관찰 | 해석할 때의 주의점 |
| --- | --- | --- |
| 탄성 변형 | 하중에 따라 변하고 제하 시 회복되는 길이 | 비선형 탄성도 가능하므로 곡선이라는 이유만으로 손상은 아님 |
| Hysteresis | 부하·제하 경로가 달라 만드는 loop | 재료 내부 거동과 접촉 마찰이 모두 기여할 수 있음 |
| Creep | 일정한 하중을 유지하는 동안 증가하는 변형 | 지연 회복과 비가역 변형을 나누려면 제하 후 관찰이 필요 |
| Stress relaxation | 일정한 변형을 유지하는 동안 감소하는 응력·장력 | 고정 하중 creep 시험과 경계 조건이 다름 |
| Constructional stretch | yarn·strand의 재배열과 조밀화에 따른 길이 변화 | 재료의 시간 의존성과 동시에 진행될 수 있음 |
| 끝단 slip·자리잡음 | 고정부 기준 마커의 이동, 국부 변위 | 모터 encoder만 보면 케이블 본체의 변형과 섞임 |
| Wear·피로 손상 | 보풀·섬유 파단·잔존 강도 등의 변화 | 외관이나 강성 하나만으로 손상량을 확정하기 어려움 |

Hysteresis는 원인 하나의 이름이라기보다 입출력 관계에서 관찰하는 특성입니다. 인장 시편에서 힘과 그에 대응하는 늘어남을 측정했다면, 안정된 한 주기의 loop 면적은

$$
W_{\mathrm{diss}}=\oint T\,\mathrm{d}\delta
$$

로 쓸 수 있습니다. 주기 시작과 끝의 내부 상태가 같고 다른 에너지 출입이 무시되는 조건에서 소산 에너지를 뜻합니다. 초기 conditioning처럼 내부 상태가 계속 바뀌는 과정에서는 입력 일이 저장 에너지 변화에도 쓰이므로 같은 해석을 바로 적용하면 안 됩니다. 또한 입력 장력과 출력 변위처럼 서로 다른 위치의 양을 임의로 짝지으면 이 에너지 정의에 맞지 않습니다.

Creep와 relaxation을 구분하는 데에는 간단한 점탄성 모델도 도움이 됩니다. 선형 점탄성의 예로, 처음에 무하중인 균일 부재에 응력 step $\sigma_0$를 가하면

$$
\varepsilon(t)=J(t)\sigma_0
$$

로 표현할 수 있습니다. $J(t)$는 creep compliance입니다. 반대로 변형률 step $\varepsilon_0$를 유지하는 시험은 relaxation modulus $E_r(t)$를 써서 $\sigma(t)=E_r(t)\varepsilon_0$로 표현합니다. 일반적인 시간 의존 재료에서 $J(t)$와 $E_r(t)$는 같은 시각의 단순 역수 관계가 아닙니다.

이 식들을 완성된 tendon의 검증된 모델로 제시하는 것은 아닙니다. 하중을 고정했는지, 길이를 고정했는지에 따라 관찰할 양부터 달라진다는 설명입니다. 실제 로봇에서 양끝 거리를 고정해 둔 케이블은 길이가 계속 늘어나는 대신 장력이 감소할 수 있습니다. 그 원인에는 재료 relaxation뿐 아니라 구조의 자리잡음과 끝단 이동도 섞일 수 있습니다.

## 5. Pretension은 작동점을 정하고, 반복 작동은 상태를 바꾼다

케이블은 당기는 힘을 전달하므로, 설계자는 slack을 피하려고 pretension을 줍니다. 일정한 반경 $r$의 이상적인 antagonistic pair를 생각하면

$$
\tau=r(T_1-T_2),\qquad
T_1=T_0+\Delta T,\quad T_2=T_0-\Delta T
$$

이고, 따라서 $\tau=2r\Delta T$입니다. 두 케이블이 팽팽한 범위에서 $T_0$는 공통 장력, $\Delta T$는 토크를 만드는 차동 성분입니다. 마찰을 무시한 이 식만 보아도, 같은 출력 토크를 만들면서 서로 다른 공통 장력을 가질 수 있습니다.

Pretension을 높이면 slack에 대한 여유가 생기지만, 접촉부와 끝단이 감당하는 하중도 바뀝니다. 비선형 force–extension 곡선에서는 사용하는 접선 강성의 구간이 달라집니다. 고정된 곡선 경로에서는 장력에 따라 접촉 반력도 달라질 수 있습니다. 따라서 pretension은 임의로 크게 잡고 잊어도 되는 조립 값이 아니라, 거동을 비교할 때 기록해야 할 작동 조건입니다.

여기서 운전 중의 pretension과 사전 conditioning을 나눌 필요가 있습니다. Pretension은 현재의 하중 상태이고, conditioning은 그 상태에 도달하기 전에 어떤 하중과 시간을 거쳤는지 정하는 절차입니다. 같은 초기 장력을 맞춰도 과거의 최대 하중과 반복 횟수가 다르면 내부 상태가 같다고 할 수 없습니다.

Lian 등은 합성섬유 로프의 bedding-in이 인장 응답과 관련 물성에 미치는 영향을 조사하고, 평균 하중·하중 진폭·반복 횟수가 bedding-in 정도에 미치는 영향을 실험했습니다. 이것이 로봇 설계에 주는 시사점은 보편적인 길들이기 횟수가 있다는 것이 아니라, **사전 하중 이력을 시험 조건의 일부로 남겨야 한다**는 것입니다. [3](#ref-3)

반복 작동 후 강성이 증가했다고 해도 수명이 늘었다고 결론 내릴 수는 없습니다. 초기 구조 재배열과 마모·피로 손상은 같은 시험 중에 함께 진행될 수 있습니다. 일정한 조건에서 응답이 안정되었다는 판단과 손상이 없다는 판단은 구분해야 합니다.

여기에 더 살펴보고 싶은 문제가 있습니다. **축 방향으로 pre-stretch한 케이블도 이후 굽힘을 겪으면 추가로 늘어날 수 있다는 점**입니다. 직선 상태에서 하중을 준 이력만으로 실제 routing에서의 길이 안정성까지 확보되는지 묻고 싶습니다. 다만 어떤 케이블과 조건에서 이런 변화가 나타나는지는 근거를 더 확인해야 합니다. 내부 yarn의 재배열은 검토할 가설이며, 재료의 creep나 끝단의 자리잡음·미끄럼과도 구분해야 합니다.

이 문제를 시험한다면 pre-stretch 조건과 이후 굽힘 조건을 함께 기록하고, 굽힘 전후의 길이를 같은 기준 장력과 회복 시간에서 비교하려 합니다. 굽힘을 겪는 동안의 변위와 굽힘 후 남는 길이 변화도 나누어 봐야 합니다. 이 질문은 Cable 04의 construction 논의로 이어가겠습니다.

<!-- 01 초안 243-262행 -->

## 7. 같은 재료여도 construction이 다르면 다른 케이블이다

앞의 문제들을 따라가다 보면 재료 이름만으로 후보를 분류하는 데 한계가 생깁니다. HMPE라는 이름은 중요하지만, 그 이름이 yarn 수, 꼬임, braid angle, core와 cover의 구성, 코팅과 가공 이력까지 알려주지는 않습니다.

합성섬유 로프는 개별 filament에서 yarn과 strand를 거쳐 완성품으로 이어지는 계층 구조를 가집니다. 제품에 따라 중간 단계와 용어는 달라지지만, 하중을 받는 섬유가 케이블 축과 항상 평행하지 않다는 점은 중요합니다. Leech는 이런 계층 구조를 따라 로프의 변형과 하중을 분석하고, 구성 요소 사이의 상대 이동과 마찰 모드를 구분했습니다. [7](#ref-7)

단순한 나선 경로를 생각해 보겠습니다. Yarn 경로 길이를 $l_y$, 축과 이루는 각을 $\alpha$, 그 구간의 축 방향 길이를 $L$이라고 하면

$$
L=l_y\cos\alpha,
\qquad
\mathrm{d}L=\cos\alpha\,\mathrm{d}l_y
-l_y\sin\alpha\,\mathrm{d}\alpha.
$$

축 방향 길이는 yarn 자체가 늘어나도 변하고, yarn의 각도가 바뀌어도 변합니다. 실제 braid에서는 yarn 간 접촉, 반경 변화와 구속이 결합되므로 이 식만으로 강성을 구할 수 없습니다. 그래도 섬유 modulus 하나가 전체 길이 변화를 결정하지 못하는 이유는 보여 줍니다.

굽힘에서는 그 접촉 구조가 다시 중요해집니다. 내부 yarn 사이에 접촉 압력과 상대 이동이 생기면 yarn-on-yarn abrasion의 경로가 열립니다. 외부 sheave와의 마찰과 내부 yarn 사이의 마찰은 위치도 상대 운동도 다릅니다. 외부 표면의 마찰계수 하나로 둘을 대표할 수는 없습니다.

여기서부터는 섬유가 강한지를 묻는 것과 함께, **그 섬유를 어떤 경로로 배치하고 서로 어떻게 접촉하게 했는지** 물어야 합니다. 이 구조와 내부 마모의 관계는 Cable 04에서 더 깊게 다루겠습니다.

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
