export class AudioManager {
  private static instance: AudioManager;
  private audioContext: AudioContext | null = null;
  private currentBGM: HTMLAudioElement | null = null;
  private isMuted: boolean = false;
  private defaultVolume: number = 0.2; // 20%の控えめな音量

  private constructor() {
    // localStorageからミュート設定を読み込み
    const savedMuteState = localStorage.getItem('bgmMuted');
    this.isMuted = savedMuteState === 'true';
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  // AudioContextの初期化（ユーザーインタラクションが必要）
  public initAudioContext(): void {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('🎵 AudioContext initialized');
      } catch (error) {
        console.warn('⚠️ AudioContext initialization failed:', error);
      }
    }
  }

  // AudioContextの再開（ブラウザ制限回避）
  public resumeAudioContext(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        console.log('🎵 AudioContext resumed');
      }).catch(error => {
        console.warn('⚠️ AudioContext resume failed:', error);
      });
    }
  }

  // BGM再生
  public playBGM(type: 'normal' | 'riichi'): void {
    console.log(`🎵 BGM playBGM called with type: ${type}, muted: ${this.isMuted}`);
    
    if (this.isMuted) {
      console.log('🔇 BGM is muted, not playing');
      return;
    }

    const fileName = type === 'riichi' ? 'bgm_riichi.mp3' : 'bgm_normal.mp3';
    const volume = type === 'riichi' ? 0.25 : 0.15; // リーチ時は少し音量を上げる

    console.log(`🎵 BGM Play Start: ${fileName}, volume: ${volume}`);

    try {
      // 現在のBGMタイプと同じ場合は何もしない
      if (this.getCurrentBGMType() === type) {
        console.log(`🎵 BGM ${type} is already playing`);
        return;
      }

      // 現在のBGMを停止
      this.stopBGM();

      // 新しいBGMを作成
      const audio = new Audio();
      audio.src = `/audio/${fileName}`;
      audio.loop = true;
      audio.volume = 0; // 最初は音量0で開始
      
      audio.addEventListener('canplaythrough', () => {
        console.log(`🎵 BGM canplaythrough: ${fileName} (volume: ${volume})`);
        
        // クロスフェードで音量を変更
        this.crossfadeBGM(audio, volume);
      });

      audio.addEventListener('error', (error) => {
        console.warn(`🎵 BGM Error: ${fileName}`, error);
      });

      audio.addEventListener('loadstart', () => {
        console.log(`🎵 BGM loadstart: ${fileName}`);
      });

      audio.addEventListener('loadeddata', () => {
        console.log(`🎵 BGM loadeddata: ${fileName}`);
      });

      // 再生開始
      this.currentBGM = audio;
      audio.play().catch(error => {
        console.warn(`🎵 BGM Play Error: ${fileName}`, error);
      });

    } catch (error) {
      console.warn(`🎵 BGM Creation Error:`, error);
    }
  }

  // クロスフェードでBGMを切り替え
  private crossfadeBGM(newAudio: HTMLAudioElement, targetVolume: number): void {
    if (!this.currentBGM) {
      newAudio.volume = targetVolume;
      newAudio.play().catch(error => {
        console.warn(`⚠️ Failed to play BGM:`, error);
      });
      return;
    }

    const oldAudio = this.currentBGM;
    const fadeDuration = 1500; // 1.5秒かけてクロスフェード
    const steps = 30;
    const stepDuration = fadeDuration / steps;
    let currentStep = 0;

    const fade = () => {
      currentStep++;
      const progress = currentStep / steps;
      
      // 古いBGMの音量を下げる
      if (oldAudio) {
        oldAudio.volume = (1 - progress) * this.defaultVolume;
      }
      
      // 新しいBGMの音量を上げる
      newAudio.volume = progress * targetVolume;
      
      if (currentStep < steps) {
        setTimeout(fade, stepDuration);
      } else {
        // フェード完了、古いBGMを停止
        if (oldAudio) {
          oldAudio.pause();
          oldAudio.currentTime = 0;
        }
        console.log(`🎵 Crossfade completed to ${targetVolume}`);
      }
    };

    // 新しいBGMの再生を開始
    newAudio.play().catch(error => {
      console.warn(`⚠️ Failed to play BGM during crossfade:`, error);
    });

    // フェード開始
    fade();
  }

  // BGM停止
  public stopBGM(): void {
    if (this.currentBGM) {
      this.currentBGM.pause();
      this.currentBGM.currentTime = 0;
      this.currentBGM = null;
      console.log('🎵 BGM stopped');
    }
  }

  // ミュート状態の切り替え
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    
    // localStorageに保存
    localStorage.setItem('bgmMuted', this.isMuted.toString());
    
    if (this.isMuted) {
      this.stopBGM();
      console.log('🔇 BGM muted');
    } else {
      console.log('🔊 BGM unmuted');
      // 現在のBGMを再再生（必要に応じて）
    }
    
    return this.isMuted;
  }

  // ミュート状態の取得
  public getIsMuted(): boolean {
    return this.isMuted;
  }

  // 音量の設定
  public setVolume(volume: number): void {
    this.defaultVolume = Math.max(0, Math.min(1, volume)); // 0-1の範囲に制限
    if (this.currentBGM) {
      this.currentBGM.volume = this.defaultVolume;
    }
  }

  // 音量の取得
  public getVolume(): number {
    return this.defaultVolume;
  }

  // 現在再生中のBGMタイプを取得
  public getCurrentBGMType(): 'normal' | 'riichi' | null {
    if (!this.currentBGM) return null;
    
    const src = this.currentBGM.src;
    if (src.includes('bgm_riichi')) return 'riichi';
    if (src.includes('bgm_normal')) return 'normal';
    return null;
  }

  // 牌破壊音を生成（AudioContextで短いビープ音）
  public playTileBreakSound(): void {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = this.audioContext;
      const duration = 0.1; // 0.1秒の短い音
      const sampleRate = audioContext.sampleRate;
      const numSamples = Math.floor(duration * sampleRate);
      
      // バッファを作成
      const buffer = audioContext.createBuffer(1, numSamples, sampleRate);
      const data = buffer.getChannelData(0);
      
      // 短いノイズ状の破裂音を生成（ホワイトノイズ）
      for (let i = 0; i < numSamples; i++) {
        data[i] = (Math.random() - 0.5) * 0.3; // 小さなランダムノイズ
      }
      
      // バッファを再生
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();
      
      console.log('🀄 Tile break sound played');
    } catch (error) {
      console.warn('⚠️ Failed to play tile break sound:', error);
    }
  }
}

// シングルトンインスタンスをエクスポート
export const audioManager = AudioManager.getInstance();
