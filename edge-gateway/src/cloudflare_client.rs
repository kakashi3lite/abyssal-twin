// Cloudflare Client: REST + WebSocket client for communicating with Workers API.
// Handles authentication, compression, and resilient retry logic for satellite.

use anyhow::Result;
use tracing::{debug, error, info, warn};

use crate::CloudflareConfig;

/// Client for Cloudflare Workers API and Durable Object WebSocket.
pub struct CloudflareClient {
    api_url: String,
    ws_url: String,
    api_token: String,
    http: reqwest::Client,
}

impl CloudflareClient {
    pub fn new(config: &CloudflareConfig) -> Self {
        // Resolve environment variable references in token
        let api_token = if config.api_token.starts_with("${") {
            let var_name = &config.api_token[2..config.api_token.len() - 1];
            std::env::var(var_name).unwrap_or_default()
        } else {
            config.api_token.clone()
        };

        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            api_url: config.api_url.clone(),
            ws_url: config.ws_url.clone(),
            api_token,
            http,
        }
    }

    /// Upload a compressed batch of states and anomalies to the ingest endpoint.
    /// Returns the number of bytes sent (for bandwidth monitoring).
    pub async fn upload_batch(
        &self,
        payload: &[u8],
    ) -> Result<usize> {
        let url = format!("{}/api/v1/ingest", self.api_url);
        let payload_len = payload.len();

        debug!(bytes = payload_len, "Uploading batch to Cloudflare");

        let response = self
            .http
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_token))
            .header("Content-Type", "application/octet-stream")
            .header("Content-Encoding", "zstd")
            .body(payload.to_vec())
            .send()
            .await?;

        if response.status().is_success() {
            info!(bytes = payload_len, "Batch uploaded successfully");
            Ok(payload_len)
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Batch upload failed");
            anyhow::bail!("Upload failed: {status} {body}");
        }
    }

    /// Upload a JSON payload (uncompressed, for anomaly alerts).
    pub async fn upload_json(&self, endpoint: &str, json: &str) -> Result<()> {
        let url = format!("{}{endpoint}", self.api_url);

        let response = self
            .http
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_token))
            .header("Content-Type", "application/json")
            .body(json.to_string())
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            warn!(status = %status, endpoint, "JSON upload failed: {body}");
            anyhow::bail!("Upload failed: {status}");
        }

        Ok(())
    }

    /// Download current global fleet state from the Durable Object.
    /// Used during reconciliation after a partition heal.
    pub async fn download_global_state(&self) -> Result<String> {
        let url = format!("{}/api/v1/fleet/status", self.api_url);

        let response = self
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_token))
            .send()
            .await?;

        if response.status().is_success() {
            Ok(response.text().await?)
        } else {
            anyhow::bail!("Failed to download global state: {}", response.status());
        }
    }

    /// Establish a WebSocket connection to the Durable Object.
    /// Used for real-time bidirectional sync when bandwidth allows.
    pub async fn connect_websocket(
        &self,
        vessel_id: u8,
    ) -> Result<(
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        tokio_tungstenite::tungstenite::http::Response<Option<Vec<u8>>>,
    )> {
        let url = format!("{}?vesselId={vessel_id}", self.ws_url);
        info!(url = %url, "Connecting WebSocket to Cloudflare DO");

        let (ws_stream, response) =
            tokio_tungstenite::connect_async(&url).await?;

        info!("WebSocket connected to Cloudflare Durable Object");
        Ok((ws_stream, response))
    }
}
