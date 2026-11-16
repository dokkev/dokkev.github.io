# Tendon-in-the-Loop: 본문으로 옮길 데모 설명

출처: `src/components/demos/TendonDynamometerDemo.tsx`의 데모 설명 문구(`help`). 2026-11-15에 데모에서 지우고 본문으로 옮기기 위해 보관.

## EN

The input actuator pulls the cable back and forth through angle A like the robot's motor. The output actuator feeds the load-cell tension into the virtual finger's equation of motion and moves the cable end to the computed finger angle, so the real cable and pulley see the same load as on a real finger. Before the finger reaches the object (free motion) the tension stays near the pretension; once it presses the object the tension climbs and the cable stretches, so the finger follows the input less. Moving the object or changing its stiffness shifts where this happens and how steeply the tension rises. In the constant-load (gravity) case the weight stays the same but its moment arm l·cos(φ + β) changes with pose, so the tension peaks with the link horizontal and drops as it nears vertical. At each reversal the pulley friction makes the finger pause. The finger emulator always keeps the output tension at or above the pretension, and since a cable only pulls, no tension goes below zero.

## KR

입력 측 액추에이터는 로봇 모터처럼 각도 A로 케이블을 주기적으로 당깁니다. 출력 측 액추에이터는 로드셀로 잰 장력을 가상 손가락의 운동방정식에 넣고, 계산된 손가락 각도만큼 케이블 끝을 움직입니다. 그래서 실제 케이블과 풀리는 진짜 손가락에 달린 것과 같은 하중을 받습니다. 손가락이 물체에 닿기 전(자유 운동)에는 장력이 pretension 근처에 머물고, 닿은 뒤에는 물체를 누르는 만큼 장력이 오르며 케이블이 늘어나 손가락이 입력을 덜 따라갑니다. 물체 위치와 강성을 바꾸면 이 전환이 생기는 각도와 장력이 오르는 기울기가 바뀝니다. 일정 하중(중력) 조건에서는 손가락 끝의 무게는 그대로지만 모멘트 암 l·cos(φ + β)가 자세에 따라 바뀌므로, 링크가 수평일 때 장력이 가장 크고 수직에 가까워질수록 작아집니다. 방향을 바꿀 때는 풀리 마찰 때문에 손가락이 잠시 멈춥니다. 손가락 에뮬레이터는 출력 측 장력이 pretension 아래로 내려가지 않게 늘 보상하고, 케이블은 당기기만 하므로 장력이 0 아래로 내려가지 않습니다.
