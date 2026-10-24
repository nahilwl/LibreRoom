#!/usr/bin/env python3
"""Measures LibreRoom desktop resource usage on Linux (headless, under Xvfb).

Samples every process descended from the app (the Tauri shell plus WebKit's web/network
processes; Xvfb itself is excluded) every 200 ms: PSS memory from /proc/<pid>/smaps_rollup
and CPU time from /proc/<pid>/stat. Phase markers printed by the app on stdout
(LIBREROOM_MARK <label>, LIBREROOM_STARTUP_MS <n>) are attached to the timeline.

usage: measure.py <binary> <seconds> [ENV=VALUE ...]
"""
import json, os, subprocess, sys, threading, time

TICK = os.sysconf("SC_CLK_TCK")


def children_map():
    kids = {}
    for pid in filter(str.isdigit, os.listdir("/proc")):
        try:
            with open(f"/proc/{pid}/stat") as f:
                fields = f.read().rsplit(")", 1)[1].split()
            kids.setdefault(int(fields[1]), []).append(int(pid))
        except OSError:
            pass
    return kids


def descendants(root):
    kids, out, todo = children_map(), [], [root]
    while todo:
        p = todo.pop()
        for c in kids.get(p, []):
            out.append(c)
            todo.append(c)
    return out


def sample(pid):
    try:
        with open(f"/proc/{pid}/comm") as f:
            name = f.read().strip()
        if name in ("Xvfb", "xvfb-run", "sh", "bash", "timeout"):
            return None
        pss = 0
        with open(f"/proc/{pid}/smaps_rollup") as f:
            for line in f:
                if line.startswith("Pss:"):
                    pss = int(line.split()[1])  # kB
        with open(f"/proc/{pid}/stat") as f:
            fields = f.read().rsplit(")", 1)[1].split()
        cpu = (int(fields[11]) + int(fields[12])) / TICK
        return name, pss, cpu
    except OSError:
        return None


def main():
    binary, seconds = sys.argv[1], float(sys.argv[2])
    env = dict(os.environ, **dict(a.split("=", 1) for a in sys.argv[3:]))
    t0 = time.monotonic()
    proc = subprocess.Popen(["xvfb-run", "-a", binary], env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    marks, report = [], {}

    def read_stdout():
        for line in proc.stdout:
            t = round(time.monotonic() - t0, 2)
            if line.startswith("LIBREROOM_MARK "):
                marks.append((t, line.split(" ", 1)[1].strip()))
            elif line.startswith("LIBREROOM_STARTUP_MS "):
                report["startup_ms"] = int(line.split()[1])
            elif line.startswith("LIBREROOM_SELFTEST "):
                report["selftest"] = json.loads(line.split(" ", 1)[1])

    threading.Thread(target=read_stdout, daemon=True).start()
    timeline = []
    while proc.poll() is None and time.monotonic() - t0 < seconds:
        procs = [s for s in map(sample, descendants(proc.pid)) if s]
        timeline.append((round(time.monotonic() - t0, 2), sum(p[1] for p in procs), sum(p[2] for p in procs), {p[0]: round(p[1] / 1024, 1) for p in procs}))
        time.sleep(0.2)
    if proc.poll() is None:
        proc.terminate()
    proc.wait(timeout=10)
    time.sleep(0.3)

    def window(start, end):
        pts = [x for x in timeline if start <= x[0] < end]
        if len(pts) < 2:
            return None
        return {
            "pss_avg_mb": round(sum(p[1] for p in pts) / len(pts) / 1024, 1),
            "pss_max_mb": round(max(p[1] for p in pts) / 1024, 1),
            "cpu_s": round(pts[-1][2] - pts[0][2], 2),
            "cpu_avg_pct": round(100 * (pts[-1][2] - pts[0][2]) / (pts[-1][0] - pts[0][0]), 1),
            "seconds": round(pts[-1][0] - pts[0][0], 1),
        }

    bounds = marks + [(timeline[-1][0] if timeline else 0, "exit")]
    report["phases"] = {label: window(t, bounds[i + 1][0]) for i, (t, label) in enumerate(bounds[:-1])}
    report["whole_run"] = window(0, 1e9)
    end = timeline[-1][0] if timeline else 0
    report["last_10s"] = window(end - 10, end + 1)
    report["pss_mb_by_process_at_end"] = timeline[-1][3] if timeline else {}
    report["last_pss_mb"] = round(timeline[-1][1] / 1024, 1) if timeline else None
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
