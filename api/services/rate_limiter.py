"""
Rate limiting dinámico para endpoints de integración externa.

Token bucket cuya tasa de relleno sube temporalmente si detecta ráfaga
de tráfico reciente (varios tickets en la última ventana) y vuelve sola
al límite base cuando el tráfico baja.

ponytail: en memoria de un solo proceso — si la API llega a correr con
más de un worker uvicorn, cada worker tiene su propio bucket (el límite
efectivo es N_workers × lo configurado aquí). Si eso pasa, mover el
estado a Redis (INCR + TTL) sin tocar la firma de allow().
"""
import time
from collections import deque


class TokenBucket:
    def __init__(
        self,
        base_rate: float = 1 / 10,   # 1 request cada 10s en reposo
        burst_rate: float = 1.0,     # 1 request/s bajo ráfaga
        burst_cap: float = 10,       # tope de tokens acumulables
        umbral_rafaga: int = 3,      # hits en la ventana para considerar "ráfaga"
        ventana_seg: float = 60,
    ):
        self.tokens = burst_cap
        self.base_rate = base_rate
        self.burst_rate = burst_rate
        self.burst_cap = burst_cap
        self.umbral_rafaga = umbral_rafaga
        self.ventana_seg = ventana_seg
        self.last_check = time.monotonic()
        self.recent_hits: deque[float] = deque()

    def allow(self) -> bool:
        now = time.monotonic()
        self.recent_hits.append(now)
        while self.recent_hits and now - self.recent_hits[0] > self.ventana_seg:
            self.recent_hits.popleft()

        rate = self.burst_rate if len(self.recent_hits) > self.umbral_rafaga else self.base_rate

        elapsed = now - self.last_check
        self.tokens = min(self.burst_cap, self.tokens + elapsed * rate)
        self.last_check = now

        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


_buckets: dict[str, TokenBucket] = {}


def get_bucket(origen: str) -> TokenBucket:
    """Un bucket por origen — cada integración externa tiene su propio límite."""
    if origen not in _buckets:
        _buckets[origen] = TokenBucket()
    return _buckets[origen]
