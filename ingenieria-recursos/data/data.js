const DATA = {
  carreras: [
    {
      slug: "ingenieria",
      title: "Ingeniería",
      description: "Carrera de ingeniería.",
      materias: [
        {
          slug: "analisis-matematico-1",
          title: "Análisis Matemático I",
          description: "Límites, derivadas e integrales.",
          temas: [
            { slug: "limites", title: "Límites", meta: "Base para cálculo" },
            { slug: "continuidad", title: "Continuidad", meta: "Propiedades" },
            { slug: "derivadas", title: "Derivadas", meta: "Tasa de cambio" },
            { slug: "integrales", title: "Integrales", meta: "Acumulación" },
            { slug: "sucesiones", title: "Sucesiones", meta: "Convergencia" },
            { slug: "series", title: "Series", meta: "Sumatorias" }
          ]
        },
        {
          slug: "fisica-1",
          title: "Física I",
          description: "Mecánica y termodinámica.",
          temas: [
            {
  slug: "mediciones",
  title: "Mediciones",
  meta: "Unidades e incertidumbre",

  videos: [
    {
      title: "Mediciones - Video 1",
      url: "https://youtu.be/SeczOCvlmco?si=fIQn32HnFPimpQCL"
    },
    {
      title: "Mediciones - Video 2",
      url: "https://youtu.be/gzX1U0fH07U?si=VXD7Z-5n_-_WMx9d"
    },
    {
      title: "Mediciones - Video 3",
      url: "https://youtu.be/emNCC0aSz9A?si=y4ExdfAWY9_1BAaV"
    }
  ],

  pdfs: [
  {
    title: "Prueba PDF",
    url: "../../pdfs/fisica-1/mediciones/mediciones.pdf.pdf"
  }
],

  herramientas: [
    {
      title: "Simulador de Magnitudes",
      url: "https://www.educaplus.org/games/magnitudes"
    }
  ]
},
            { slug: "estatica", title: "Estática", meta: "Equilibrio de fuerzas" },
            { slug: "cinematica", title: "Cinemática", meta: "Movimiento sin fuerzas" },
            { slug: "dinamica", title: "Dinámica", meta: "Leyes de Newton" },
            { slug: "trabajo-energia", title: "Trabajo y energía", meta: "Energía mecánica" },
            { slug: "cantidad-movimiento", title: "Cantidad de movimiento", meta: "Choques e impulso" },
            { slug: "rotaciones", title: "Rotaciones", meta: "Movimiento angular" },
            { slug: "moas", title: "Movimiento oscilatorio", meta: "Oscilaciones" },
            { slug: "elasticidad", title: "Elasticidad", meta: "Deformaciones" },
            { slug: "fluidos", title: "Fluidos", meta: "Presión y Bernoulli" },
            { slug: "calorimetria", title: "Calorimetría", meta: "Transferencia de calor" },
            { slug: "termodinamica", title: "Termodinámica", meta: "Leyes térmicas" },
            { slug: "ondas", title: "Ondas", meta: "Propagación" },
            { slug: "sonido", title: "Sonido", meta: "Acústica" }
          ]
        }
      ]
    }
  ]
};