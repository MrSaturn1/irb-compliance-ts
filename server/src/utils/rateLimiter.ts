export class RateLimiter {
  private tokensUsedPerMinute: number = 0;
  private tokenLimitPerMinute: number = 59000;
  private lastMinuteReset: number = Date.now();
  private lastRequestTime: number = 0;
  private minInterval: number = 2000; // 2 seconds in milliseconds
  private requestsPerDay: number = 0;
  private requestLimitPerDay: number = 100000;
  private lastDayReset: number = Date.now();

  async limit<T>(fn: () => Promise<T>, tokensRequested: number): Promise<T> {
    await this.waitIfNeeded(tokensRequested);
    
    try {
      this.requestsPerDay++;
      const result = await fn();
      this.addTokens(tokensRequested);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Rate limit reached')) {
        console.log('Rate limit error caught. Retrying...');
        return this.limit(fn, tokensRequested);
      }
      throw error;
    }
  }

  private async waitIfNeeded(tokensRequested: number): Promise<void> {
    const now = Date.now();
    
    if (now - this.lastMinuteReset > 60000) {
      this.resetTokens();
    }

    if (this.tokensUsedPerMinute + tokensRequested > this.tokenLimitPerMinute) {
      const waitTime = 60000 - (now - this.lastMinuteReset);
      console.log(`Rate limit approaching. Waiting ${waitTime}ms before continuing.`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.resetTokens();
    }

    // Check for daily limit
    if (this.requestsPerDay >= this.requestLimitPerDay) {
      const waitTime = 86400000 - (now - this.lastDayReset);
      console.log(`Daily request limit reached. Waiting ${waitTime}ms before continuing.`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.resetDailyCounter();
    }
  }

  private resetTokens(): void {
    this.tokensUsedPerMinute = 0;
    this.lastMinuteReset = Date.now();
    console.log('Token count reset');
  }

  private resetDailyCounter(): void {
    this.requestsPerDay = 0;
    this.lastDayReset = Date.now();
    console.log('Daily request count reset');
  }

  private resetCountersIfNeeded(now: number): void {
    if (now - this.lastMinuteReset > 60000) {
      console.log(`Resetting token count. Previous count: ${this.tokensUsedPerMinute}`);
      this.tokensUsedPerMinute = 0;
      this.lastMinuteReset = now;
    }
    if (now - this.lastDayReset > 86400000) {
      this.requestsPerDay = 0;
      this.lastDayReset = now;
    }
  }

  private logRateLimitInfo(error: any): void {
    if ('response' in error && typeof error.response === 'object' && error.response !== null) {
      const response = error.response as any;
      if ('headers' in response) {
        console.log('Rate Limit Headers:');
        console.log('Retry-After:', response.headers['retry-after']);
        console.log('X-RateLimit-Limit-Requests:', response.headers['x-ratelimit-limit-requests']);
        console.log('X-RateLimit-Limit-Tokens:', response.headers['x-ratelimit-limit-tokens']);
        console.log('X-RateLimit-Remaining-Requests:', response.headers['x-ratelimit-remaining-requests']);
        console.log('X-RateLimit-Remaining-Tokens:', response.headers['x-ratelimit-remaining-tokens']);
        console.log('X-RateLimit-Reset-Requests:', response.headers['x-ratelimit-reset-requests']);
        console.log('X-RateLimit-Reset-Tokens:', response.headers['x-ratelimit-reset-tokens']);
      }
    }
  }

  private getRetryAfterTime(error: any): number {
    if (error.response && error.response.headers) {
      const retryAfter = error.response.headers['retry-after'];
      if (retryAfter) {
        return parseInt(retryAfter) * 1000; // Convert seconds to milliseconds
      }
    }
    return 5000; // Default to 5 seconds if retry-after header is not available
  }

  addTokens(tokens: number) {
    const now = Date.now();
    if (now - this.lastMinuteReset > 60000) {
      this.resetTokens();
    }
    this.tokensUsedPerMinute += tokens;
    console.log(`Added ${tokens} tokens. New total: ${this.tokensUsedPerMinute}`);
  }

  getTokensUsed(): number {
    return this.tokensUsedPerMinute;
  }
}