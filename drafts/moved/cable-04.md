# Cable 04 재료: 끝단 고정

출처: `content/blog/Cable/2026-11-15-cable-01-kr.md` (Cable 01 초안). 2026-11-16 Cable 시리즈를 5편으로 재구성하면서 01에서 떼어 냄. 아래는 원문 그대로이며, 참고문헌 번호는 01 초안의 번호입니다.

<!-- 01 초안 211-241행 -->

## 6. Knot과 termination도 전달계의 일부다

케이블 양끝을 이상적인 고정점으로 그리면 편리합니다. 실제 끝단에서는 케이블의 장력을 구조물로 전달해야 합니다. 매듭, clamp, splice, 봉제, 접착 또는 권선 고정은 각각 다른 접촉과 하중 전달 경로를 만듭니다.

매듭에는 작은 굽힘 반경과 자기 접촉이 생깁니다. Clamp에서는 고정력을 얻는 동시에 국부 압착을 가합니다. Splice에서는 겹친 구간을 따라 하중이 전달됩니다. 어느 방식이든 풀림이나 파단뿐 아니라, 하중을 받은 뒤 자리잡는 변위도 확인해야 합니다.

Horigome와 Endo는 같은 연구에서 여러 끝단 고정법의 강도도 비교했습니다. 그 결과는 “매듭은 언제나 정해진 비율로 강도를 낮춘다”는 상수가 아니라, 시험한 로프와 고정 조건에 대한 결과로 읽어야 합니다. [2](#ref-2)

비교를 위해 끝단을 포함한 조립체의 파단 하중과 기준 직선 시편의 파단 하중 비율을

$$
\eta_{\mathrm{term}}=
\frac{F_{\mathrm{break,assembly}}}
{F_{\mathrm{break,reference}}}
$$

로 정의할 수 있습니다. 시편과 시험 조건을 맞추고 파단 위치도 함께 기록해야 의미가 있습니다. 이 비율은 정적 강도에 관한 값이며, 반복 중의 길이 안정성이나 피로 수명까지 보장하지 않습니다.

끝단 설계가 바뀌면 매듭에 도달하는 하중도 바꿀 수 있습니다. Endo 등은 grooved pulley의 권선 마찰과 figure-eight knot loop·pin을 함께 사용하는 고정법을 제안하고 실험했습니다. 케이블이 버티는 힘은 매듭의 이름만으로 결정되지 않고, 매듭 앞에서 하중을 어떻게 전달하는지에도 달려 있다는 예입니다. [5](#ref-5)

끝단이 파단하지 않아도 모델에는 들어와야 합니다. 같은 장력이 흐르는 직선 조립체를 작은 변동 범위에서 선형화하고, 케이블 본체·양끝 고정부·프레임이 직렬로 변형한다고 가정하면

$$
\frac{1}{k_{\mathrm{measured}}}=
\frac{1}{k_{\mathrm{cable}}}
+\frac{1}{k_{\mathrm{end,1}}}
+\frac{1}{k_{\mathrm{end,2}}}
+\frac{1}{k_{\mathrm{frame}}}.
$$

따라서 actuator 변위로 추정한 강성을 케이블 재료의 물성이라고 바로 부를 수는 없습니다. 이 식 역시 접촉 마찰로 장력이 달라지는 경로나 비가역 slip을 하나의 탄성 스프링으로 설명하지는 않습니다.

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
