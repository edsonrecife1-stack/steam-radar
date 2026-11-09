// fetch_deals.js
const fs = require('fs');

async function fetchDeals() {
  console.log('Iniciando coleta automática de promoções e jogos grátis...');

  let existingData = { free: [], deals: [], lastUpdate: '' };
  if (fs.existsSync('deals.json')) {
    try {
      existingData = JSON.parse(fs.readFileSync('deals.json', 'utf8'));
    } catch (e) {
      console.warn('Criando nova base de dados.');
    }
  }

  try {
    // 1. Promoções com grandes descontos na Steam (via CheapShark API)
    const dealsRes = await fetch('https://www.cheapshark.com/api/1.0/deals?storeID=1&sortBy=Savings&pageSize=30');
    const rawDeals = await dealsRes.json();

    // 2. Jogos 100% grátis na Steam
    const steamFreeRes = await fetch('https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=0');
    const rawSteamFree = await steamFreeRes.json();

    // 3. Jogos grátis da semana na Epic Games Store
    let rawEpicFree = [];
    try {
      const epicRes = await fetch('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR');
      const epicData = await epicRes.json();
      const elements = epicData?.data?.Catalog?.searchStore?.elements || [];

      // Filtra apenas os jogos atualmente com 100% de desconto
      rawEpicFree = elements.filter(game => {
        const promo = game.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
        const isFree = game.price?.totalPrice?.discountPrice === 0;
        return promo && isFree;
      }).map(game => {
        const imageObj = game.keyImages?.find(img => img.type === 'Thumbnail' || img.type === 'DieselStoreFrontWide') || game.keyImages?.[0];
        return {
          id: 'epic_' + game.id,
          title: game.title,
          thumb: imageObj ? imageObj.url : 'https://placehold.co/600x400?text=Epic+Game',
          normalPrice: (game.price?.totalPrice?.originalPrice / 100).toFixed(2),
          salePrice: '0.00',
          discount: 100,
          platform: 'Epic Games',
          link: `https://store.epicgames.com/pt-BR/p/${game.catalogNs?.mappings?.[0]?.pageSlug || game.productSlug || ''}`,
          fetchedAt: new Date().toISOString()
        };
      });
    } catch (epicErr) {
      console.warn('Falha ao obter jogos da Epic:', epicErr.message);
    }

    const formattedDeals = rawDeals.map(d => ({
      id: d.dealID,
      title: d.title,
      platform: 'Steam',
      thumb: d.thumb,
      normalPrice: (parseFloat(d.normalPrice) * 5.5).toFixed(2),
      salePrice: (parseFloat(d.salePrice) * 5.5).toFixed(2),
      discount: Math.round(parseFloat(d.savings)),
      link: `https://store.steampowered.com/app/${d.steamAppID}`
    }));

    const formattedSteamFree = rawFreeList(rawSteamFree);

    // Junta jogos grátis da Steam e da Epic
    const allNewFree = [...formattedSteamFree, ...rawEpicFree];

    // Mantém jogos grátis salvos anteriormente por até 7 dias para não perder promoções ativas
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const combinedFree = [...allNewFree];

    (existingData.free || []).forEach(oldItem => {
      const isStillFresh = new Date(oldItem.fetchedAt || 0).getTime() > sevenDaysAgo;
      const alreadyIncluded = combinedFree.some(item => item.title.toLowerCase() === oldItem.title.toLowerCase());
      if (isStillFresh && !alreadyIncluded) {
        combinedFree.push(oldItem);
      }
    });

    const finalOutput = {
      lastUpdate: new Date().toISOString(),
      freeCount: combinedFree.length,
      free: combinedFree,
      deals: formattedDeals
    };

    fs.writeFileSync('deals.json', JSON.stringify(finalOutput, null, 2));
    console.log(`Sucesso! ${combinedFree.length} jogos grátis e ${formattedDeals.length} promoções salvas.`);
  } catch (error) {
    console.error('Erro na coleta de dados:', error);
    process.exit(1);
  }
}

function rawFreeList(rawSteamFree) {
  return rawSteamFree.map(f => ({
    id: f.dealID,
    title: f.title,
    platform: 'Steam',
    thumb: f.thumb,
    normalPrice: (parseFloat(f.normalPrice) * 5.5).toFixed(2),
    salePrice: '0.00',
    discount: 100,
    link: `https://store.steampowered.com/app/${f.steamAppID}`,
    fetchedAt: new Date().toISOString()
  }));
}

fetchDeals();
