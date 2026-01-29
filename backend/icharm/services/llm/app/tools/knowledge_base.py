"""
Platform Knowledge Base - RAG system for documentation.
Uses vector embeddings to retrieve relevant docs about platform features.
"""

from __future__ import annotations

from typing import Any, Dict, List


class PlatformKnowledgeBase:
    """
    Retrieval-Augmented Generation system for platform documentation.
    Stores and retrieves information about platform features, UI, workflows.
    """

    def __init__(self, persist_directory: str = "./chroma_db"):
        """
        Initialize ChromaDB client.
        Creates a persistent vector database for documentation.
        """
        self.client = None
        self.collection = None
        self.docs: List[Dict[str, Any]] = []

        try:
            import chromadb

            self.client = chromadb.PersistentClient(path=persist_directory)
            self.collection = self.client.get_or_create_collection(
                name="platform_docs",
                metadata={"hnsw:space": "cosine"},
            )
        except Exception:
            self.client = None
            self.collection = None

    def index_documentation(self) -> None:
        """
        Index all platform documentation.
        Call this once during setup or when docs are updated.
        """
        docs: List[Dict[str, Any]] = [
            {
                "id": "globe-basic-navigation",
                "text": """
                The 3D Globe provides interactive visualization of climate data:
                - **Left-click and drag** to rotate the globe
                - **Right-click and drag** to pan the view
                - **Scroll wheel** to zoom in and out
                - **Click any location** on the globe to select it and see detailed data
                - The selected location will show as a pin marker
                - Location coordinates appear in the info panel
                """,
                "category": "navigation",
                "keywords": ["globe", "rotate", "zoom", "pan", "click", "navigate"],
            },
            {
                "id": "dataset-selection",
                "text": """
                Selecting and viewing datasets:
                - **Left sidebar** shows all available datasets organized by category
                - Click any dataset name to load it on the globe
                - The current dataset name appears in the top bar
                - Use the search box to filter datasets by name
                - Dataset layers render with color-coded values (see legend)
                - Some datasets support multiple variables (use dropdown to switch)
                """,
                "category": "datasets",
                "keywords": ["dataset", "select", "sidebar", "layers", "variables"],
            },
            {
                "id": "time-slider",
                "text": """
                Time Navigation:
                - **Time slider** at the bottom controls the displayed date/time
                - Drag the slider handle to move through time
                - Play button animates through time automatically
                - Date display shows current selected timestamp
                - Different datasets have different temporal resolutions (hourly, daily, monthly)
                - Available time range depends on the dataset
                """,
                "category": "navigation",
                "keywords": ["time", "slider", "date", "animation", "play", "temporal"],
            },
            {
                "id": "color-legend",
                "text": """
                Understanding the Color Legend:
                - **Legend panel** shows the color scale for current dataset
                - Colors map data values to visual representation
                - Min/max values shown at legend extremes
                - Color schemes vary by dataset type (precipitation, temperature, etc.)
                - Click legend to adjust color scale (advanced feature)
                """,
                "category": "visualization",
                "keywords": ["color", "legend", "scale", "colorbar", "values"],
            },
            {
                "id": "timeseries-dashboard",
                "text": """
                Timeseries Dashboard (accessed via Dashboard menu):
                - **Line charts** show data over time for selected location
                - **Zoom and pan** on charts by clicking and dragging
                - **Statistics panel** displays mean, min, max, std deviation
                - **Data table** shows all values with timestamps
                - **Export buttons** allow CSV or JSON download
                - **Save chart** as PNG image
                - **Analysis options**: raw values, anomalies, or trend lines
                - Charts support multiple datasets simultaneously for comparison
                """,
                "category": "dashboard",
                "keywords": [
                    "timeseries",
                    "chart",
                    "graph",
                    "statistics",
                    "export",
                    "dashboard",
                ],
            },
            {
                "id": "location-search",
                "text": """
                Location Search:
                - **Search box** in the top-right lets you find locations by name
                - Type a city, country, or region name
                - Select from dropdown results to fly to that location
                - Globe automatically zooms and centers on selected location
                - Works with major cities, countries, landmarks, and geographic features
                """,
                "category": "navigation",
                "keywords": ["search", "location", "city", "find", "geocoding"],
            },
            {
                "id": "chat-assistant",
                "text": """
                Chat Assistant (AI Helper):
                - **Chat panel** provides AI-powered help and data analysis
                - Ask questions about data: "What was the rainfall in Tokyo last month?"
                - Ask about features: "How do I export data?"
                - Get statistical insights: "Show me temperature trends"
                - Compare locations: "Which city had more rain?"
                - Chat is context-aware of your current globe view
                - Conversation history is saved per session
                """,
                "category": "chat",
                "keywords": ["chat", "AI", "assistant", "ask", "help", "questions"],
            },
            {
                "id": "export-data",
                "text": """
                Exporting Data:
                - **Timeseries Dashboard**: Use 'Export CSV' or 'Export JSON' buttons
                - **CSV format**: Timestamp, Value, Units columns
                - **JSON format**: Structured data with full metadata
                - Exports include: location coordinates, dataset info, time range
                - Chart images: Click camera icon to save as PNG
                - All exports include attribution and data source information
                """,
                "category": "export",
                "keywords": ["export", "download", "CSV", "JSON", "save", "data"],
            },
            {
                "id": "dataset-types-precipitation",
                "text": """
                Precipitation Datasets:
                - **CMORPH**: High-resolution (8km) satellite precipitation, 30-minute intervals, 1998-present
                - **GPM IMERG**: Global precipitation from GPM satellite mission
                - **ERA5 Precipitation**: Reanalysis precipitation at 0.25 deg resolution
                All precipitation data in mm/day or mm/hour depending on temporal resolution.
                Useful for: flood monitoring, drought analysis, water resource management
                """,
                "category": "datasets",
                "keywords": [
                    "precipitation",
                    "rainfall",
                    "CMORPH",
                    "GPM",
                    "ERA5",
                    "rain",
                ],
            },
            {
                "id": "dataset-types-temperature",
                "text": """
                Temperature Datasets:
                - **ERA5 Temperature**: 2m air temperature at 0.25 deg resolution, hourly
                - **ERA5 Tmax/Tmin**: Daily maximum and minimum temperatures
                Temperature units in Celsius or Kelvin (check dataset metadata).
                Useful for: heatwave detection, cold spell analysis, climate monitoring
                """,
                "category": "datasets",
                "keywords": [
                    "temperature",
                    "ERA5",
                    "heat",
                    "cold",
                    "celsius",
                    "kelvin",
                ],
            },
            {
                "id": "dataset-types-vegetation",
                "text": """
                Vegetation Datasets:
                - **MODIS NDVI**: Normalized Difference Vegetation Index, 250m resolution, 16-day composite
                - **GIMMS NDVI**: Long-term NDVI record, 8km resolution, 1981-present
                NDVI ranges from -1 to 1, where higher values indicate healthier/denser vegetation.
                Useful for: agriculture monitoring, drought impact, land cover change
                """,
                "category": "datasets",
                "keywords": [
                    "vegetation",
                    "NDVI",
                    "MODIS",
                    "GIMMS",
                    "agriculture",
                    "greenness",
                ],
            },
            {
                "id": "account-saved-analyses",
                "text": """
                Saving and Managing Analyses:
                - **Dashboard menu** shows your saved analyses and locations
                - Click 'Save Analysis' to bookmark current location + dataset + time range
                - Saved items appear in Dashboard for quick access
                - Each save includes: location name, coordinates, dataset, date range
                - Rename or delete saved analyses from Dashboard
                - Saved analyses persist across sessions (requires login)
                """,
                "category": "account",
                "keywords": ["save", "bookmark", "dashboard", "saved", "analyses"],
            },
            {
                "id": "data-quality-notes",
                "text": """
                Data Quality and Limitations:
                - All datasets have **gaps** due to satellite coverage, clouds, or sensor issues
                - **Null/missing values** are common in satellite products
                - **Spatial resolution** varies: 8km (CMORPH) to 0.25 deg (ERA5) to 250m (MODIS)
                - **Temporal resolution** varies: 30-min to daily to monthly
                - Always check dataset metadata for coverage dates and known issues
                - For critical applications, verify with ground station data
                """,
                "category": "data-quality",
                "keywords": [
                    "quality",
                    "accuracy",
                    "limitations",
                    "gaps",
                    "missing data",
                ],
            },
        ]

        if self.collection is not None:
            self.collection.add(
                documents=[doc["text"] for doc in docs],
                metadatas=[
                    {
                        "category": doc["category"],
                        "keywords": ",".join(doc["keywords"]),
                    }
                    for doc in docs
                ],
                ids=[doc["id"] for doc in docs],
            )
            print(f"Indexed {len(docs)} documentation chunks")
        else:
            self.docs = docs

    def query(self, question: str, n_results: int = 3) -> List[Dict[str, Any]]:
        """
        Query the knowledge base for relevant documentation.

        Args:
            question: User's question
            n_results: Number of relevant docs to return

        Returns:
            List of dicts with 'text', 'category', 'relevance_score'
        """
        if self.collection is None:
            return self._simple_query(question, n_results)

        results = self.collection.query(query_texts=[question], n_results=n_results)

        if not results.get("documents") or len(results["documents"]) == 0:
            return []

        docs: List[Dict[str, Any]] = []
        for idx in range(len(results["documents"][0])):
            docs.append(
                {
                    "text": results["documents"][0][idx],
                    "category": results["metadatas"][0][idx].get("category", "general"),
                    "relevance_score": results.get("distances", [[1.0]])[0][idx],
                }
            )

        return docs

    def _simple_query(self, question: str, n_results: int) -> List[Dict[str, Any]]:
        if not self.docs:
            return []

        tokens = {token.strip(".,!?").lower() for token in question.split()}
        scored: List[Dict[str, Any]] = []

        for doc in self.docs:
            keywords = doc.get("keywords", [])
            keyword_set = (
                {kw.lower() for kw in keywords}
                if isinstance(keywords, list)
                else {kw.strip().lower() for kw in str(keywords).split(",")}
            )
            score = len(tokens.intersection(keyword_set))
            if score > 0:
                scored.append({**doc, "score": score})

        scored.sort(key=lambda item: int(item.get("score", 0)), reverse=True)
        top = scored[:n_results]

        results: List[Dict[str, Any]] = []
        for doc in top:
            score_raw = doc.get("score", 0)
            score_value = (
                float(score_raw) if isinstance(score_raw, (int, float, str)) else 0.0
            )
            results.append(
                {
                    "text": str(doc["text"]),
                    "category": str(doc.get("category", "general")),
                    "relevance_score": score_value,
                }
            )
        return results

    def get_all_categories(self) -> List[str]:
        """Get list of all documentation categories"""
        return [
            "navigation",
            "datasets",
            "visualization",
            "dashboard",
            "chat",
            "export",
            "account",
            "data-quality",
        ]
