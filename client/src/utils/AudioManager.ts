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
    if (this.isMuted) {
      console.log('🔇 BGM is muted, skipping playback');
      return;
    }

    // 現在のBGMを停止
    this.stopBGM();

    // AudioContextがなければ初期化
    if (!this.audioContext) {
      this.initAudioContext();
    }

    // ファイルパスを構築
    const fileName = type === 'riichi' ? 'bgm_riichi.mp3' : 'bgm_normal.mp3';
    const filePath = `/audio/${fileName}`;

    try {
      // 新しいAudio要素を作成
      const audio = new Audio();
      audio.src = filePath;
      audio.volume = this.defaultVolume;
      audio.loop = true; // ループ再生

      // イベントリスナーを設定
      audio.addEventListener('loadstart', () => {
        console.log(`🎵 Loading BGM: ${fileName}`);
      });

      audio.addEventListener('canplaythrough', () => {
        console.log(`🎵 BGM ready to play: ${fileName}`);
        audio.play().catch(error => {
          console.warn(`⚠️ Failed to play BGM ${fileName}:`, error);
        });
      });

      audio.addEventListener('error', (error) => {
        console.warn(`⚠️ BGM file not found or error: ${fileName}`, error);
      });

      // 再生開始
      this.currentBGM = audio;
      
      // 即時再生を試みる（ファイルが存在する場合）
      audio.play().catch(() => {
        // ファイルが存在しない場合のエラーは無視
        console.log(`🎵 BGM file ${fileName} not available yet`);
      });

    } catch (error) {
      console.warn(`⚠️ Error creating BGM audio element:`, error);
    }
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
}

// シングルトンインスタンスをエクスポート
export const audioManager = AudioManager.getInstance();
