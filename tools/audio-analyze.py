import time,subprocess,base64,sys,struct,wave
import numpy as np
from playwright.sync_api import sync_playwright
P="47192"; ROOT=sys.argv[1] if len(sys.argv)>1 else "/workspace/repos/blackhole_game"
srv=subprocess.Popen(["python3","-m","http.server",P,"--bind","127.0.0.1"],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
out={}
with sync_playwright() as p:
    br=p.chromium.launch();pg=br.new_page()
    pg.goto(f"http://127.0.0.1:{P}/manifest.json")
    OLD="""async()=>{const sr=44100,off=new OfflineAudioContext(1,30*sr,sr);const m=off.createGain();m.gain.value=0.4*0.12;m.connect(off.destination);
      [1,1.5,2.01].forEach((r,i)=>{const o=off.createOscillator(),g=off.createGain(),f=off.createBiquadFilter();o.type=i?'triangle':'sine';o.frequency.value=73.4*r*(1+i*0.003);f.type='lowpass';f.frequency.value=420;f.Q.value=0.7;g.gain.value=i?0.03/(1+i*0.3):0.08;o.connect(f);f.connect(g);g.connect(m);o.start(0)});
      const b=await off.startRendering();const d=b.getChannelData(0);let mx=0;for(const v of d)mx=Math.max(mx,Math.abs(v));const i16=new Int16Array(d.length);for(let i=0;i<d.length;i++)i16[i]=d[i]/mx*16000;
      let s='';const u=new Uint8Array(i16.buffer);for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)}"""
    out["old_drone_tonal(normalized)"]=np.frombuffer(base64.b64decode(pg.evaluate(OLD)),dtype=np.int16)
    for name,opts in [("sample","{layerIdx:1}"),("deep","{layerIdx:3,biteEvery:0.7,seed:3}"),("tonal_only","{layerIdx:3,biteEvery:0.7,seed:3,bed:false}"),("music_only","{layerIdx:3,biteEvery:999,seed:3,bed:false}")]:
        b64=pg.evaluate("""async()=>{const a=await import('/js/audio.js');const b=await a.renderPreview(30,%s);const d=b.getChannelData(0);
        const i16=new Int16Array(d.length);for(let i=0;i<d.length;i++)i16[i]=Math.max(-32767,Math.min(32767,d[i]*32767));
        let s='';const u=new Uint8Array(i16.buffer);for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)}"""%opts)
        out[name]=np.frombuffer(base64.b64decode(b64),dtype=np.int16)
    br.close()
srv.kill()
for name,x in out.items():
    fn=f"/workspace/bhpt/a_{name[:9]}.wav" if name!="sample" else "/workspace/bh_v71_audio_sample.wav"
    w=wave.open(fn,"wb");w.setnchannels(1);w.setsampwidth(2);w.setframerate(44100);w.writeframes(x.tobytes());w.close()
    f=x.astype(np.float64)/32767; sr=44100
    peak=20*np.log10(np.abs(f).max()+1e-12); rms=20*np.log10(np.sqrt((f**2).mean())+1e-12)
    sp=np.abs(np.fft.rfft(f*np.hanning(len(f))))**2; fr=np.fft.rfftfreq(len(f),1/sr)
    cent=(fr*sp).sum()/sp.sum(); band=sp[(fr>=2000)&(fr<=5000)].sum()/sp.sum()
    lo=sp[fr<150].sum()/sp.sum()
    # roughness: Sethares/Plomp-Levelt over spectral peaks of 1s windows
    def rough(seg):
        s=np.abs(np.fft.rfft(seg*np.hanning(len(seg)))); fq=np.fft.rfftfreq(len(seg),1/sr)
        m=(fq>60)&(fq<4000); s=s[m]; fq=fq[m]
        idx=[i for i in range(1,len(s)-1) if s[i]>s[i-1] and s[i]>=s[i+1] and s[i]>s.max()*0.05]
        idx=sorted(idx,key=lambda i:-s[i])[:20]; R=0
        for a in range(len(idx)):
            for b in range(a+1,len(idx)):
                f1,f2=sorted([fq[idx[a]],fq[idx[b]]]); A=min(s[idx[a]],s[idx[b]])/s.max()
                sc=0.24/(0.021*f1+19); d=f2-f1
                R+=A*(np.exp(-3.5*sc*d)-np.exp(-5.75*sc*d))
        return R
    # amplitude-envelope modulation (analytic signal): beating shows as envelope energy
    def modspec(seg):
        X=np.fft.fft(seg); h=np.zeros(len(seg)); h[0]=1; h[1:len(seg)//2]=2; env=np.abs(np.fft.ifft(X*h))
        env=env[::49]; esr=sr/49; E=np.abs(np.fft.rfft(env-env.mean()))**2; ef=np.fft.rfftfreq(len(env),1/esr)
        tot=(env.mean()**2)*len(env)**2/4+1e-12
        return E[(ef>=15)&(ef<=300)].sum()/tot, E[(ef>=1)&(ef<15)].sum()/tot
    ms=[modspec(f[i:i+2*sr]) for i in range(0,len(f)-2*sr,2*sr)]
    print(f"   envelope roughness-band (15-300Hz) index {np.mean([m[0] for m in ms]):.4f}, fluctuation 1-15Hz {np.mean([m[1] for m in ms]):.4f}")
    R=[rough(f[i:i+sr]) for i in range(0,len(f)-sr,sr)]
    print(f"{name}: peak {peak:.1f} dBFS, RMS {rms:.1f} dBFS, centroid {cent:.0f} Hz, energy 2-5kHz {band*100:.3f}%, <150Hz {lo*100:.1f}%")
