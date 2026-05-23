import danbooruApi from './danbooruApi';

export interface ApiHealthResult {
  status: 'healthy' | 'slow' | 'overloaded' | 'rate_limited' | 'down';
  responseTime: number;
  statusCode: number;
  error?: string;
  rateLimitInfo?: {
    remaining: number;
    limit: number;
    reset: number;
  };
}

export interface ApiHealthSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  slowResponses: number;
  errors: number;
  rateLimitHits: number;
  averageResponseTime: number;
  recommendations: string[];
}

export class DanbooruApiHealthTester {
  private results: ApiHealthResult[] = [];

  async runFullHealthCheck(): Promise<ApiHealthSummary> {
    this.results = [];
    
    // Test básico de conectividad
    await this.testBasicConnectivity();
    
    // Test de búsqueda de tags
    await this.testTagSearch();
    
    // Test de búsqueda de posts
    await this.testPostSearch();
    
    // Test de rate limiting
    await this.testRateLimiting();
    
    return this.generateSummary();
  }

  private async testBasicConnectivity(): Promise<void> {
    const startTime = Date.now();
    try {
      await danbooruApi.getTag('test');
      const responseTime = Date.now() - startTime;
      
      this.results.push({
        status: responseTime < 1000 ? 'healthy' : responseTime < 3000 ? 'slow' : 'overloaded',
        responseTime,
        statusCode: 200,
        rateLimitInfo: danbooruApi.getRateLimitStats()?.rateLimitInfo
      });
    } catch (error) {
      this.results.push({
        status: 'down',
        responseTime: Date.now() - startTime,
        statusCode: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async testTagSearch(): Promise<void> {
    const startTime = Date.now();
    try {
      await danbooruApi.searchTags({ name_matches: 'test', limit: 5 });
      const responseTime = Date.now() - startTime;
      
      this.results.push({
        status: responseTime < 1000 ? 'healthy' : responseTime < 3000 ? 'slow' : 'overloaded',
        responseTime,
        statusCode: 200,
        rateLimitInfo: danbooruApi.getRateLimitStats()?.rateLimitInfo
      });
    } catch (error) {
      this.results.push({
        status: 'down',
        responseTime: Date.now() - startTime,
        statusCode: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async testPostSearch(): Promise<void> {
    const startTime = Date.now();
    try {
      await danbooruApi.searchPosts({ tags: 'test', limit: 1 });
      const responseTime = Date.now() - startTime;
      
      this.results.push({
        status: responseTime < 1000 ? 'healthy' : responseTime < 3000 ? 'slow' : 'overloaded',
        responseTime,
        statusCode: 200,
        rateLimitInfo: danbooruApi.getRateLimitStats()?.rateLimitInfo
      });
    } catch (error) {
      this.results.push({
        status: 'down',
        responseTime: Date.now() - startTime,
        statusCode: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async testRateLimiting(): Promise<void> {
    const startTime = Date.now();
    try {
      // Hacer múltiples requests rápidos para probar rate limiting
      const promises = Array.from({ length: 3 }, () => 
        danbooruApi.searchTags({ name_matches: 'test', limit: 1 })
      );
      
      await Promise.all(promises);
      const responseTime = Date.now() - startTime;
      
      const rateLimitInfo = danbooruApi.getRateLimitStats()?.rateLimitInfo;
      const isRateLimited = rateLimitInfo && rateLimitInfo.remaining <= 2;
      
      this.results.push({
        status: isRateLimited ? 'rate_limited' : 'healthy',
        responseTime,
        statusCode: 200,
        rateLimitInfo
      });
    } catch (error) {
      this.results.push({
        status: 'down',
        responseTime: Date.now() - startTime,
        statusCode: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private generateSummary(): ApiHealthSummary {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'healthy').length;
    const failedTests = this.results.filter(r => r.status === 'down').length;
    const slowResponses = this.results.filter(r => r.status === 'slow').length;
    const errors = this.results.filter(r => r.error).length;
    const rateLimitHits = this.results.filter(r => r.status === 'rate_limited').length;
    
    const averageResponseTime = this.results.reduce((sum, r) => sum + r.responseTime, 0) / totalTests;
    
    const recommendations: string[] = [];
    
    if (failedTests > 0) {
      recommendations.push('La API parece estar caída o inaccesible');
    }
    
    if (slowResponses > 0) {
      recommendations.push('La API está respondiendo lentamente');
    }
    
    if (rateLimitHits > 0) {
      recommendations.push('Se han alcanzado límites de rate limiting');
    }
    
    if (averageResponseTime > 2000) {
      recommendations.push('El tiempo de respuesta promedio es muy alto');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('La API está funcionando correctamente');
    }
    
    return {
      totalTests,
      passedTests,
      failedTests,
      slowResponses,
      errors,
      rateLimitHits,
      averageResponseTime,
      recommendations
    };
  }

  getDetailedResults(): ApiHealthResult[] {
    return [...this.results];
  }
}

export async function quickApiHealthCheck(): Promise<ApiHealthSummary> {
  const tester = new DanbooruApiHealthTester();
  return await tester.runFullHealthCheck();
}

export async function startApiMonitoring(
  intervalMs: number, 
  callback: (summary: ApiHealthSummary) => void
): Promise<() => void> {
  let isRunning = true;
  
  const runCheck = async () => {
    if (!isRunning) return;
    
    try {
      const summary = await quickApiHealthCheck();
      callback(summary);
    } catch (error) {
      // Error in API monitoring
    }
    
    if (isRunning) {
      setTimeout(runCheck, intervalMs);
    }
  };
  
  // Iniciar el primer check
  runCheck();
  
  // Retornar función para detener el monitoreo
  return () => {
    isRunning = false;
  };
}