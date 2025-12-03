import psutil
import time
import os
import functools


def benchmark(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        proc = psutil.Process(os.getpid())
        cpu_before = proc.cpu_times()
        mem_before = proc.memory_info().rss
        start = time.perf_counter()

        result = fn(*args, **kwargs)

        elapsed = time.perf_counter() - start
        cpu_after = proc.cpu_times()
        mem_after = proc.memory_info().rss

        print(f"{fn.__name__}:")
        print(f"\tWall time: {elapsed:.6f}s")
        print(f"\tCPU user: {cpu_after.user - cpu_before.user:.6f}s")
        print(f"\tCPU system: {cpu_after.system - cpu_before.system:.6f}s")
        print(f"\tMemory change: {(mem_after - mem_before) / 1024**2:.3f} MB")

        return result

    return wrapper
