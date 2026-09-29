import { SearchResponse, SearchParams, Track } from '../types/music';
import { MusicApi } from './api';
import { YTMusicAPI } from './ytmusic-api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROVIDER_KEY = 'openspot_provider_v1';

const containsChinese = (text: string): boolean => {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text);
};

export class MusicAPI {
  private static searchCache = new Map<string, Promise<SearchResponse>>();
  private static streamCache = new Map<string, Promise<string>>();
  private static recentlyPlayedStorageKey = 'openspot_recently_played_tracks_v1';
  private static recentlyPlayedLimit = 30;

  private static async getProvider(): Promise<'saavn' | 'ytmusic'> {
    try {
      const provider = await AsyncStorage.getItem(PROVIDER_KEY);
      return (provider === 'ytmusic' ? 'ytmusic' : 'saavn') as 'saavn' | 'ytmusic';
    } catch {
      return 'saavn';
    }
  }

  private static resolveProviderHint(
    trackOrProvider?: Track | 'saavn' | 'ytmusic'
  ): 'saavn' | 'ytmusic' | null {
    if (!trackOrProvider) return null;

    if (trackOrProvider === 'saavn' || trackOrProvider === 'ytmusic') {
      return trackOrProvider;
    }

    return trackOrProvider.provider || null;
  }

  /**
   * Automatically use YouTube Music for Chinese/CJK searches.
   * Everything else keeps using the selected/default provider.
   */
  private static async searchTracksAutoProvider(
    query: string
  ): Promise<SearchResponse> {
    if (containsChinese(query)) {
      console.log('[MusicAPI] Chinese query detected, using YouTube Music:', query);

      try {
        const ytResult = await YTMusicAPI.search({
          q: query,
          type: 'track',
        });

        if (ytResult.tracks.length > 0) {
          return ytResult;
        }

        console.log(
          '[MusicAPI] YouTube Music returned no results, falling back to Saavn:',
          query
        );
      } catch (error) {
        console.warn(
          '[MusicAPI] YouTube Music search failed, falling back to Saavn:',
          error
        );
      }
    }

    return MusicApi.searchTracks(query, 0, 20);
  }

  static async search(params: SearchParams): Promise<SearchResponse> {
    const provider = await this.getProvider();

    /*
     * For normal track searches:
     *
     * Chinese query -> YouTube Music
     * Other query   -> selected provider
     */
    if (!params.type || params.type === 'track') {
      if (containsChinese(params.q)) {
        return this.searchTracksAutoProvider(params.q);
      }

      if (provider === 'ytmusic') {
        return YTMusicAPI.search({
          q: params.q,
          type: 'track',
        });
      }
    }

    return MusicApi.search(params);
  }

  static async searchTracks(
    query: string,
    offset: number = 0,
    limit: number = 20
  ): Promise<SearchResponse> {
    const provider = await this.getProvider();

    /*
     * Chinese searches automatically use YouTube Music.
     */
    if (containsChinese(query)) {
      console.log(
        '[MusicAPI] Chinese track search detected, using YouTube Music:',
        query
      );

      try {
        const ytResult = await YTMusicAPI.search({
          q: query,
          type: 'track',
        });

        if (ytResult.tracks.length > 0) {
          return ytResult;
        }

        console.log(
          '[MusicAPI] YouTube Music returned no Chinese results, falling back to Saavn'
        );
      } catch (error) {
        console.warn(
          '[MusicAPI] YouTube Music Chinese search failed, falling back to Saavn:',
          error
        );
      }
    }

    if (provider === 'ytmusic') {
      return YTMusicAPI.search({
        q: query,
        type: 'track',
      });
    }

    return MusicApi.searchTracks(query, offset, limit);
  }

  static async getStreamUrl(
    trackId: string,
    trackOrProvider?: Track | 'saavn' | 'ytmusic'
  ): Promise<string> {
    const hintedProvider = this.resolveProviderHint(trackOrProvider);
    const provider = hintedProvider || 'saavn';

    if (provider === 'ytmusic') {
      return YTMusicAPI.getStreamUrl(trackId);
    }

    return MusicApi.getStreamUrl(trackId);
  }

  static async getDownloadUrl(
    trackId: string,
    trackOrProvider?: Track | 'saavn' | 'ytmusic'
  ): Promise<string> {
    const hintedProvider = this.resolveProviderHint(trackOrProvider);
    const provider = hintedProvider || 'saavn';

    if (provider === 'ytmusic') {
      return YTMusicAPI.getDownloadUrl(trackId);
    }

    return MusicApi.getStreamUrl(trackId);
  }

  static async getPopularTracks(): Promise<Track[]> {
    return MusicApi.getPopularTracks();
  }

  static async getAlbumSongs(albumId: string): Promise<Track[]> {
    const provider = await this.getProvider();

    if (provider === 'ytmusic') {
      return MusicApi.getAlbumSongs(albumId);
    }

    return MusicApi.getAlbumSongs(albumId);
  }

  static async getArtistSongs(
    artistId: string,
    page: number = 0
  ): Promise<{ tracks: Track[]; total: number }> {
    const provider = await this.getProvider();

    if (provider === 'ytmusic') {
      return MusicApi.getArtistSongs(artistId, page);
    }

    return MusicApi.getArtistSongs(artistId, page);
  }

  static async getPlaylistSongs(playlistId: string): Promise<Track[]> {
    const provider = await this.getProvider();

    if (provider === 'ytmusic') {
      return MusicApi.getPlaylistSongs(playlistId);
    }

    return MusicApi.getPlaylistSongs(playlistId);
  }

  static async getPlaylistSongsPaginated(
    playlistId: string,
    page = 0
  ): Promise<{ tracks: Track[]; total: number }> {
    const provider = await this.getProvider();

    if (provider === 'ytmusic') {
      const all = await MusicApi.getPlaylistSongs(playlistId);
      return {
        tracks: all,
        total: all.length,
      };
    }

    return MusicApi.getPlaylistSongsPaginated(playlistId, page);
  }

  static async getRecentlyPlayed(): Promise<Track[]> {
    try {
      const stored = await AsyncStorage.getItem(
        this.recentlyPlayedStorageKey
      );

      if (!stored) return [];

      const parsed = JSON.parse(stored) as Track[];

      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to read recently played tracks:', error);
      return [];
    }
  }

  static async addToRecentlyPlayed(track: Track): Promise<void> {
    try {
      const existing = await this.getRecentlyPlayed();

      const deduped = existing.filter(
        (item) => item.id.toString() !== track.id.toString()
      );

      const next = [track, ...deduped].slice(
        0,
        this.recentlyPlayedLimit
      );

      await AsyncStorage.setItem(
        this.recentlyPlayedStorageKey,
        JSON.stringify(next)
      );
    } catch (error) {
      console.error('Failed to save recently played track:', error);
    }
  }

  static async clearRecentlyPlayed(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.recentlyPlayedStorageKey);
    } catch (error) {
      console.error('Failed to clear recently played tracks:', error);
    }
  }

  static async getMadeForYou(): Promise<Track[]> {
    return MusicApi.getMadeForYou();
  }

  static async resolveTrackById(
    trackId: string,
    preferredProvider?: 'saavn' | 'ytmusic'
  ): Promise<Track | null> {
    const providers: ('saavn' | 'ytmusic')[] = preferredProvider
      ? [
          preferredProvider,
          preferredProvider === 'saavn' ? 'ytmusic' : 'saavn',
        ]
      : ['saavn', 'ytmusic'];

    for (const provider of providers) {
      try {
        const response =
          provider === 'saavn'
            ? await MusicApi.search({
                q: trackId,
                type: 'track',
              })
            : await YTMusicAPI.search({
                q: trackId,
                type: 'track',
              });

        if (response.tracks.length > 0) {
          return response.tracks[0];
        }
      } catch {
        // Try the next provider.
      }
    }

    return null;
  }

  static formatDuration(duration: number): string {
    const seconds = Math.floor(duration);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}:${remainingMinutes
        .toString()
        .padStart(2, '0')}:${remainingSeconds
        .toString()
        .padStart(2, '0')}`;
    }

    return `${minutes}:${remainingSeconds
      .toString()
      .padStart(2, '0')}`;
  }

  static getOptimalImage(images: {
    small: string;
    thumbnail: string;
    large: string;
  }): string {
    return images.large || images.small || images.thumbnail;
  }

  static isHighQuality(track: Track): boolean {
    return (
      track.audioQuality.isHiRes ||
      track.audioQuality.maximumBitDepth >= 24
    );
  }

  static getQualityBadge(track: Track): string | null {
    if (track.audioQuality.isHiRes) return 'Hi-Res';

    if (track.audioQuality.maximumBitDepth >= 24) {
      return 'HD';
    }

    return null;
  }

  static clearCache(): void {
    this.searchCache.clear();
    this.streamCache.clear();
  }

  static clearSearchCache(): void {
    this.searchCache.clear();
  }

  static clearStreamCache(): void {
    this.streamCache.clear();
  }
}
