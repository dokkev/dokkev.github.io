# Cable 05 재료: 경로와 마찰

출처: `content/blog/Cable/2026-11-15-cable-01-kr.md` (Cable 01 초안). 2026-11-16 Cable 시리즈를 5편으로 재구성하면서 01에서 떼어 냄. 아래는 원문 그대로이며, 참고문헌 번호는 01 초안의 번호입니다.

<!-- 01 초안 18-18행 -->

다만 원격 배치를 위해 Bowden conduit를 사용하면 cable–sheath 사이의 마찰과 hysteresis가 힘의 전달과 역방향 반사를 제한할 수 있습니다 [10](#ref-10). 말단 관성을 줄이려는 설계가 mechanical transparency에는 다른 비용을 만들 수 있다는 뜻입니다. Cable 자체와 Bowden 전달계의 장점을 나누어, 어떤 routing에서 원격 구동의 이점이 남는지 Cable 02에서 살펴보겠습니다.

<!-- 01 초안 144-154행 -->

마찰은 또 다른 문제를 만듭니다. 이상적인 유연 케이블이 고정된 원통 가이드와 접촉하며, 일정한 마찰계수 $\mu$로 완전히 미끄러진다고 가정하면 capstan 관계는

$$
\frac{T_{\mathrm{high}}}{T_{\mathrm{low}}}=e^{\mu\theta}
$$

가 됩니다. $\theta$는 radian 단위의 접촉각입니다. 이 등식은 임박 미끄럼 조건에도 사용하지만, 정지 마찰 상태에서는 일반적으로 그 한계에 도달하지 않습니다. 이상적인 Coulomb 모델의 정지 조건은 $T_{\mathrm{high}}/T_{\mathrm{low}}\leq e^{\mu_s\theta}$입니다.

여기서 중요한 것은 입력과 출력의 장력이 다를 수 있다는 점입니다. 방향을 바꾸면 어느 쪽이 높은 장력인지도 달라질 수 있고, 정지 구간의 장력 분포에는 직전 운동의 영향이 남을 수 있습니다. Palli 등은 곡선 고정 경로를 따라 움직이는 polymer tendon에서 마찰과 점탄성 효과를 함께 모델링하고, 경로 여러 지점의 장력을 측정해 검증했습니다. [1](#ref-1)

자유롭게 회전하는 풀리에 같은 지수 감쇠를 그대로 부여해서도 안 됩니다. 케이블과 풀리 사이에 큰 미끄럼이 없다면, 장력 차이는 베어링 저항, 풀리 관성, 케이블의 굽힘 손실 등을 포함해 따로 살펴야 합니다. “풀리에 감겨 있다”는 형상만으로 접촉 모델을 정할 수는 없습니다.

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
