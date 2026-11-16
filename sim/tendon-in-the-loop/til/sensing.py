"""Seeded causal motor telemetry frontend; command is known immediately by the controller."""
from collections import deque
from dataclasses import dataclass
from math import exp, sqrt
import numpy as np


@dataclass
class MotorSensorParams:
    sample_period: float = .001
    filter_tau: float = 0.
    delay: float = 0.
    dropout_probability: float = 0.
    bias_drift_A_per_sqrt_s: float = 0.
    bias_bound_A: float = .05


class MotorSensor:
    def __init__(self, params=None, seed=0):
        self.p=params or MotorSensorParams(); self.seed=seed
        if self.p.sample_period<=0 or min(self.p.filter_tau,self.p.delay,self.p.bias_drift_A_per_sqrt_s)<0 or not 0<=self.p.dropout_probability<1:
            raise ValueError("invalid motor sensor timing/noise")
        self.reset()

    def reset(self):
        self.rng=np.random.default_rng(self.seed)
        self.bias=0.; self.last_time=None; self.filtered=None; self.output=None
        self.queue=deque()

    def sample(self,t,raw):
        if self.last_time is not None and t-self.last_time<self.p.sample_period-1e-10:
            return {**self.output,"applied_command":raw["applied_command"]}
        dt=self.p.sample_period if self.last_time is None else t-self.last_time
        self.last_time=t
        self.bias=float(np.clip(self.bias+self.p.bias_drift_A_per_sqrt_s*sqrt(dt)*self.rng.normal(),-self.p.bias_bound_A,self.p.bias_bound_A))
        values=dict(raw); values["current"]+=self.bias
        alpha=1. if self.p.filter_tau==0 else 1-exp(-dt/self.p.filter_tau)
        if self.filtered is None:self.filtered=dict(values)
        else:
            for key in ("position","velocity","current"):
                self.filtered[key]+=alpha*(values[key]-self.filtered[key])
        frame={**values,**{k:self.filtered[k] for k in ("position","velocity","current")}}
        self.queue.append((t,frame))
        if self.output is None:self.output=dict(frame)
        eligible=None
        while self.queue and self.queue[0][0]<=t-self.p.delay+1e-10:
            eligible=self.queue.popleft()[1]
        if eligible is not None and self.rng.random()>=self.p.dropout_probability:
            self.output=dict(eligible)
        return {**self.output,"applied_command":raw["applied_command"]}
