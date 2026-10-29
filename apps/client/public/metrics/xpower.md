# xPower

Skiba 定义的“xPower”是对骑行功率进行 25 秒指数平滑后，再按四次方平均得到的等效功率，用于刻画生理负荷。

- 先对功率做 25s EWMA 平滑，获得瞬时 LNP
- 对 LNP 的四次方取平均，再开四次方
- 对应 BikeScore 与相对强度（RI）的计算基础

与 Coggan 的 NP 概念相似，但算法细节不同，更多用于 Skiba 体系的训练负荷。
